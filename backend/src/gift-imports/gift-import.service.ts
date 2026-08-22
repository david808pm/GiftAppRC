import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../common/services/supabase-storage.service';
import * as ExcelJS from 'exceljs';
import { ImportIssue } from '../imports/import-validation';
import {
  LIMITS,
  GIFT_CODE,
  GiftImportRow,
  normalizeFolderKey,
  normalizeReference,
  normalizeGiftGender,
  normalizeGiftStatus,
  numberToText,
  checkGiftStock,
  checkGiftAge,
  checkAgeRange,
  checkGiftGender,
  checkGiftStatus,
  checkRequired,
  checkMaxLength,
  parseGiftHeaders,
  detectDuplicateReferences,
  hasBlockingErrors,
  sniffImageType,
  imageMimeToExtension,
} from './gift-import-validation';
import {
  loadGiftZip,
  inflateEntry,
  isOsMetadataFile,
  ZipEntryMeta,
} from './gift-import-zip';

// ── Result shapes (allowlisted response contract) ─────────────────────────

export interface GiftImportFolderFileInfo {
  name: string;
  size: number;
  mime: string | null; // validated magic bytes; null when decode failed
}

export interface GiftImportFolderInfo {
  row: number;
  campaignSlug: string;
  name: string;
  reference: string;
  imageFolder: string;
  matched: boolean;
  files: GiftImportFolderFileInfo[];
}

export interface GiftImportValidationResult {
  canImport: boolean;
  totalRows: number;
  errorCount: number;
  warningCount: number;
  issues: ImportIssue[];
  errors: ImportIssue[];
  warnings: { row: number; message: string }[];
  summary: { totalGifts: number; totalImages: number };
  folderPreviews: GiftImportFolderInfo[];
}

export interface GiftImportCommitResult {
  canImport: true;
  totalRows: number;
  giftsCreated: number;
  imagesUploaded: number;
  warningCount: number;
  warnings: { row: number; message: string }[];
  errorCount: 0;
}

// ── Internal analysis artifacts ────────────────────────────────────────────

interface MaterializedImage {
  name: string;
  size: number;
  mime: string;
  buffer: Buffer;
}

interface AnalysisRow extends GiftImportRow {
  campaignId: number;
  images: MaterializedImage[];
}

interface Analysis {
  canImport: boolean;
  rows: AnalysisRow[];
  issues: ImportIssue[];
  warningCount: number;
  folderPreviews: GiftImportFolderInfo[];
  totalImages: number;
}

function toLegacyWarning(issue: ImportIssue): { row: number; message: string } {
  return { row: issue.row, message: issue.message };
}

@Injectable()
export class GiftImportService {
  private readonly logger = new Logger(GiftImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  // ── Public API ───────────────────────────────────────────────────────────

  /** Phase 1: validate the full package. Zero writes, zero uploads. */
  async validatePackage(
    excelFile: Express.Multer.File,
    zipFile: Express.Multer.File,
    adminUserId: number,
  ): Promise<GiftImportValidationResult> {
    const analysis = await this.analyze(excelFile, zipFile, adminUserId);

    const errorIssues = analysis.issues.filter((i) => i.severity === 'ERROR');

    return {
      canImport: analysis.canImport,
      totalRows: analysis.rows.length,
      errorCount: errorIssues.length,
      warningCount: analysis.warningCount,
      issues: analysis.issues,
      errors: errorIssues,
      warnings: analysis.issues
        .filter((i) => i.severity === 'WARNING')
        .map(toLegacyWarning),
      summary: {
        totalGifts: analysis.rows.length,
        totalImages: analysis.totalImages,
      },
      folderPreviews: analysis.folderPreviews,
    };
  }

  /**
   * Phase 2: commit. Re-validates the complete package (atomic rule) and, only
   * with zero blocking errors, executes the import as a COMPENSATED
   * all-or-nothing workflow:
   *   - on any failure, every gift, GiftImage row and Storage object created
   *     by THIS attempt is removed; pre-existing data is never touched.
   */
  async commitImport(
    excelFile: Express.Multer.File,
    zipFile: Express.Multer.File,
    adminUserId: number,
  ): Promise<GiftImportCommitResult | GiftImportValidationResult> {
    const analysis = await this.analyze(excelFile, zipFile, adminUserId);

    if (!analysis.canImport) {
      const errorIssues = analysis.issues.filter((i) => i.severity === 'ERROR');
      return {
        canImport: false,
        totalRows: analysis.rows.length,
        errorCount: errorIssues.length,
        warningCount: analysis.warningCount,
        issues: analysis.issues,
        errors: errorIssues,
        warnings: analysis.issues
          .filter((i) => i.severity === 'WARNING')
          .map(toLegacyWarning),
        summary: {
          totalGifts: analysis.rows.length,
          totalImages: analysis.totalImages,
        },
        folderPreviews: analysis.folderPreviews,
      };
    }

    // ── Compensated execution ──────────────────────────────────────────
    const createdGifts: Array<{ id: number; campaignId: number }> = [];
    const uploadedPaths: string[] = [];
    let imagesUploaded = 0;

    try {
      const BATCH_SIZE = 10;
      const BATCH_TIMEOUT = 120000;
      const rows = analysis.rows;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);

        // 1) Create gifts for the batch (single transaction).
        const created = await this.prisma.$transaction(
          async (tx) => {
            await tx.gift.createMany({
              data: batch.map((r) => ({
                campaignId: r.campaignId,
                name: r.name.trim(),
                reference: r.referenceNorm,
                shortDescription: r.shortDescription,
                technicalDescription: r.technicalDescription,
                dimensions: r.dimensions,
                stock: r.stock,
                minAge: r.minAge,
                maxAge: r.maxAge,
                allowedGender: r.allowedGender,
                status: r.status,
                createdById: adminUserId,
              })),
            });

            const campaignIds = [...new Set(batch.map((r) => r.campaignId))];
            const references = [...new Set(batch.map((r) => r.referenceNorm))];
            const fresh = await tx.gift.findMany({
              where: {
                campaignId: { in: campaignIds },
                reference: { in: references },
                deletedAt: null,
              },
              select: { id: true, campaignId: true, reference: true },
            });
            return fresh;
          },
          { timeout: BATCH_TIMEOUT, maxWait: 20000 },
        );

        const byKey = new Map<string, { id: number }>();
        for (const g of created) {
          byKey.set(`${g.campaignId}::${g.reference}`, g);
        }

        // 2) Upload images per gift (outside the DB transaction, bounded
        //    concurrency) and then persist their GiftImage rows.
        for (const row of batch) {
          const gift = byKey.get(
            `${row.campaignId}::${row.referenceNorm}`,
          );
          if (!gift) continue;
          createdGifts.push({ id: gift.id, campaignId: row.campaignId });

          if (row.images.length === 0) continue;

          const { results, failures } = await runWithConcurrencyCollect(
            row.images,
            LIMITS.UPLOAD_CONCURRENCY,
            async (img) => {
              const storagePath = this.storage.buildStoragePath(
                row.campaignId,
                gift.id,
                imageMimeToExtension(img.mime),
              );
              const publicUrl = await this.storage.uploadFile(
                img.buffer,
                storagePath,
                img.mime,
              );
              // Track as soon as the upload succeeds so compensation can remove
              // it even if a later/parallel upload of the same attempt fails.
              uploadedPaths.push(storagePath);
              return { storagePath, publicUrl };
            },
          );
          if (failures.length > 0) {
            throw failures[0];
          }

          await this.prisma.giftImage.createMany({
            data: results.map((res, idx) => ({
              giftId: gift.id,
              imageUrl: res.publicUrl,
              altText: row.images[idx].name,
              sortOrder: idx,
              isPrimary: idx === 0,
            })),
          });
          imagesUploaded += results.length;
        }
      }

      return {
        canImport: true,
        totalRows: rows.length,
        giftsCreated: createdGifts.length,
        imagesUploaded,
        warningCount: analysis.warningCount,
        warnings: analysis.issues
          .filter((i) => i.severity === 'WARNING')
          .map(toLegacyWarning),
        errorCount: 0,
      };
    } catch (err) {
      await this.compensate(createdGifts, uploadedPaths, err);
      throw err;
    }
  }

  /** Build the downloadable Excel template (Spanish headers + instructions). */
  async buildTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Regalos');
    ws.addRow([
      'CarpetaImagenes',
      'Campaña',
      'Nombre',
      'Referencia',
      'DescripciónCorta',
      'DescripciónTécnica',
      'Medidas',
      'Cantidad',
      'EdadMinima',
      'EdadMaxima',
      'Género',
      'Estado',
    ]);
    ws.getRow(1).eachCell((cell) => {
      const c = cell as ExcelJS.Cell;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A5F' },
      };
    });
    ws.getRow(1).addPageBreak();
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: 12 },
    };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    ws.addRow([
      'gift-001',
      'tigo-2026',
      'Mochila térmica',
      'MOCH-001',
      'Mochila para llevar snacks fríos',
      'Aislante térmico, 20L',
      '30cm x 15cm x 10cm',
      100,
      0,
      13,
      'todos',
      'Activo',
    ]);

    const inst = wb.addWorksheet('Instrucciones');
    const notes = [
      'Instrucciones de uso - Importación de Regalos',
      '1. Una fila por regalo. Los encabezados están en la fila 1 y no deben cambiarse.',
      '2. CarpetaImagenes: nombre de la carpeta (dentro del ZIP) que contiene las imágenes de ese regalo. El nombre se compara de forma exacta (sin importar mayúsculas).',
      '3. Campaña: slug de la campaña existente donde se creará el regalo.',
      '4. Cada carpeta debe contener entre 1 y 3 imágenes (JPEG, PNG o WebP), de máximo 2 MB cada una.',
      '5. Campos obligatorios: CarpetaImagenes, Campaña, Nombre, Referencia, Cantidad, EdadMinima, EdadMaxima, Género.',
      '6. Campos opcionales: DescripciónCorta, DescripciónTécnica, Medidas, Estado.',
      '7. Cantidad (stock) debe ser un número entero mayor o igual a 0. No puede estar vacío.',
      '8. EdadMinima y EdadMaxima deben ser números enteros entre 0 y 13.',
      '9. Género: valores permitidos: all, todos, male, masculino, female, femenino.',
      '10. Estado: valores permitidos: ACTIVE, Activo, INACTIVE, Inactivo. Si se deja vacío, el regalo se crea como Activo.',
      '11. Si dejas vacío un campo opcional, se guarda como vacío (nunca la palabra "null").',
      '12. Referencia no puede repetirse en la misma campaña.',
      '13. El archivo ZIP debe ser un .zip de máximo 50 MB. El Excel .xlsx debe ser de máximo 5 MB.',
    ];
    notes.forEach((n) => inst.addRow([n]));

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf as unknown as ArrayBuffer);
  }

  // ── Analysis (shared by validate + commit) ───────────────────────────────

  private async analyze(
    excelFile: Express.Multer.File,
    zipFile: Express.Multer.File,
    adminUserId: number,
  ): Promise<Analysis> {
    if (!excelFile || !zipFile) {
      throw new BadRequestException(
        'Debe enviar exactamente un archivo Excel y un archivo ZIP.',
      );
    }
    if (excelFile.size > LIMITS.EXCEL_MAX_BYTES) {
      throw new BadRequestException(
        `El archivo Excel supera el límite de ${LIMITS.EXCEL_MAX_BYTES / 1024 / 1024} MB.`,
      );
    }
    if (
      !excelFile.originalname.toLowerCase().endsWith('.xlsx')
    ) {
      throw new BadRequestException('El campo excel debe ser un archivo .xlsx.');
    }
    if (!zipFile.originalname.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException('El campo zip debe ser un archivo .zip.');
    }

    const issues: ImportIssue[] = [];

    // ── 1. Parse Excel ─────────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(excelFile.buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException(
        'El archivo Excel no pudo leerse o está dañado.',
      );
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('El archivo Excel no contiene hojas.');
    }

    const rawHeaders: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
      rawHeaders[col] = numberToText(cell.value);
    });
    const rawHeaderNames = rawHeaders.filter((h) => h && h.trim() !== '');

    const header = parseGiftHeaders(rawHeaderNames);
    issues.push(...header.issues);

    const rows: AnalysisRow[] = [];
    let rowImagesReferenced = 0;

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const get = (key: string): unknown => {
        const idx = header.columnIndex.get(key);
        if (idx === undefined) return undefined;
        return row.getCell(idx + 1).value;
      };

      const imageFolder = numberToText(get('imageFolder')).trim();
      const campaignSlug = numberToText(get('campaignSlug')).trim();
      const name = numberToText(get('name')).trim();
      const reference = numberToText(get('reference')).trim();
      const referenceNorm = normalizeReference(reference);
      const shortRaw = numberToText(get('shortDescription')).trim();
      const shortDescription = shortRaw ? shortRaw : null;
      const techRaw = numberToText(get('technicalDescription')).trim();
      const technicalDescription = techRaw ? techRaw : null;
      const dimsRaw = numberToText(get('dimensions')).trim();
      const dimensions = dimsRaw ? dimsRaw : null;
      const stockRaw = get('stock');
      const minAgeRaw = get('minAge');
      const maxAgeRaw = get('maxAge');
      const genderRaw = numberToText(get('allowedGender')).trim();
      const statusRaw = numberToText(get('status')).trim();

      // Required + max-length checks (never stop on the first error).
      const rowIssues: ImportIssue[] = [
        checkRequired(
          rowNumber,
          'imageFolder',
          imageFolder,
          'La carpeta de imágenes es obligatoria.',
        ),
        checkRequired(
          rowNumber,
          'campaignSlug',
          campaignSlug,
          'La campaña es obligatoria.',
        ),
        checkRequired(rowNumber, 'name', name, 'El nombre es obligatorio.'),
        checkRequired(
          rowNumber,
          'reference',
          reference,
          'La referencia es obligatoria.',
        ),
      ].filter((i): i is ImportIssue => i !== null);

      rowIssues.push(
        ...checkGiftStock(rowNumber, stockRaw),
        ...checkGiftAge(rowNumber, 'minAge', minAgeRaw),
        ...checkGiftAge(rowNumber, 'maxAge', maxAgeRaw),
        ...checkGiftGender(rowNumber, genderRaw),
        ...checkGiftStatus(rowNumber, statusRaw),
      );

      rowIssues.push(
        ...[
          checkMaxLength(
            rowNumber,
            'name',
            name,
            180,
            'El nombre no puede superar los 180 caracteres.',
          ),
          checkMaxLength(
            rowNumber,
            'reference',
            reference,
            50,
            'La referencia no puede superar los 50 caracteres.',
          ),
          checkMaxLength(
            rowNumber,
            'campaignSlug',
            campaignSlug,
            200,
            'El slug de la campaña no puede superar los 200 caracteres.',
          ),
          checkMaxLength(
            rowNumber,
            'imageFolder',
            imageFolder,
            255,
            'El nombre de la carpeta de imágenes no puede superar los 255 caracteres.',
          ),
          checkMaxLength(
            rowNumber,
            'shortDescription',
            shortDescription ?? '',
            500,
            'La descripción corta no puede superar los 500 caracteres.',
          ),
          checkMaxLength(
            rowNumber,
            'technicalDescription',
            technicalDescription ?? '',
            2000,
            'La descripción técnica no puede superar los 2000 caracteres.',
          ),
          checkMaxLength(
            rowNumber,
            'dimensions',
            dimensions ?? '',
            100,
            'Las medidas no pueden superar los 100 caracteres.',
          ),
        ].filter((i): i is ImportIssue => i !== null),
      );

      issues.push(...rowIssues);

      const stockNum = Number(numberToText(stockRaw));
      const minAgeNum = Number(numberToText(minAgeRaw));
      const maxAgeNum = Number(numberToText(maxAgeRaw));
      const genderNorm = normalizeGiftGender(genderRaw);
      // Empty status defaults ACTIVE (parity with manual create).
      const statusNorm = statusRaw
        ? (normalizeGiftStatus(statusRaw) as 'ACTIVE' | 'INACTIVE')
        : 'ACTIVE';

      if (Number.isInteger(minAgeNum) && Number.isInteger(maxAgeNum)) {
        issues.push(...checkAgeRange(rowNumber, minAgeNum, maxAgeNum));
      }

      const hasValidShape =
        imageFolder.trim() !== '' &&
        campaignSlug.trim() !== '' &&
        name.trim() !== '' &&
        reference.trim() !== '' &&
        Number.isInteger(stockNum) &&
        stockNum >= 0 &&
        Number.isInteger(minAgeNum) &&
        Number.isInteger(maxAgeNum) &&
        genderNorm !== null;

      rows.push({
        excelRow: rowNumber,
        rawIndex: rows.length,
        imageFolder,
        campaignSlug,
        name,
        reference,
        referenceNorm,
        shortDescription,
        technicalDescription,
        dimensions,
        stock: Number.isInteger(stockNum) ? stockNum : 0,
        minAge: Number.isInteger(minAgeNum) ? minAgeNum : 0,
        maxAge: Number.isInteger(maxAgeNum) ? maxAgeNum : 13,
        allowedGender: (genderNorm as 'all' | 'male' | 'female') ?? 'all',
        status: statusNorm,
        folderKey: hasValidShape ? normalizeFolderKey(imageFolder) : null,
        campaignReferenceKey:
          hasValidShape && campaignSlug && referenceNorm
            ? `${normalizeFolderKey(campaignSlug)}::${referenceNorm}`
            : null,
        campaignId: -1,
        images: [],
      });
    });

    if (rows.length > LIMITS.MAX_GIFTS) {
      issues.push({
        row: 2,
        column: 'name',
        columnLabel: 'Nombre',
        value: null,
        severity: 'ERROR',
        code: GIFT_CODE.GIFT_LIMIT_EXCEEDED,
        message: `El Excel contiene ${rows.length} regalos. El máximo permitido es ${LIMITS.MAX_GIFTS}.`,
      });
    }

    // ── 2. Parse ZIP (security layer) ──────────────────────────────────
    const zipResult = await loadGiftZip(zipFile.buffer);
    issues.push(...zipResult.issues);
    issues.push(...zipResult.warnings);

    // ── 3. DB reads (never writes) ─────────────────────────────────────
    const slugs = [
      ...new Set(rows.map((r) => r.campaignSlug).filter((s) => s.trim() !== '')),
    ];
    const campaignBySlug = new Map<string, { id: number; status: string }>();
    if (slugs.length > 0) {
      const campaigns = await this.prisma.campaign.findMany({
        where: { slug: { in: slugs }, deletedAt: null },
        select: { id: true, slug: true, status: true },
      });
      for (const c of campaigns) {
        campaignBySlug.set(c.slug, { id: c.id, status: c.status });
      }
      const found = new Set(campaigns.map((c) => c.slug));
      for (const r of rows) {
        if (!r.campaignSlug) continue;
        if (!found.has(r.campaignSlug)) {
          issues.push({
            row: r.excelRow,
            column: 'campaignSlug',
            columnLabel: 'Campaña (slug)',
            value: r.campaignSlug,
            severity: 'ERROR',
            code: GIFT_CODE.CAMPAIGN_NOT_FOUND,
            message: `La campaña "${r.campaignSlug}" no existe o fue eliminada.`,
          });
          continue;
        }
        const status = campaignBySlug.get(r.campaignSlug)!.status;
        if (status !== 'DRAFT' && status !== 'ACTIVE') {
          issues.push({
            row: r.excelRow,
            column: 'campaignSlug',
            columnLabel: 'Campaña (slug)',
            value: r.campaignSlug,
            severity: 'ERROR',
            code: GIFT_CODE.CAMPAIGN_STATUS_NOT_OPEN,
            message: `La campaña "${r.campaignSlug}" no admite cargas (estado ${status}).`,
          });
        }
      }

      // Existing references check (blocking duplicates against the DB).
      const refChecks = rows
        .filter(
          (r) => r.campaignReferenceKey && campaignBySlug.has(r.campaignSlug),
        )
        .map((r) => ({
          row: r.excelRow,
          campaignId: campaignBySlug.get(r.campaignSlug)!.id,
          reference: r.referenceNorm,
        }));
      const distinctPairs = [
        ...new Map(
          refChecks.map((rc) => [`${rc.campaignId}::${rc.reference}`, rc]),
        ).values(),
      ];
      if (distinctPairs.length > 0) {
        const existing = await this.prisma.gift.findMany({
          where: {
            deletedAt: null,
            OR: distinctPairs.map((p) => ({
              campaignId: p.campaignId,
              reference: p.reference,
            })),
          },
          select: { campaignId: true, reference: true },
        });
        const existingKeys = new Set(
          existing.map((g) => `${g.campaignId}::${g.reference}`),
        );
        for (const rc of refChecks) {
          if (existingKeys.has(`${rc.campaignId}::${rc.reference}`)) {
            issues.push({
              row: rc.row,
              column: 'reference',
              columnLabel: 'Referencia',
              value: rc.reference,
              severity: 'ERROR',
              code: GIFT_CODE.REFERENCE_ALREADY_EXISTS,
              message: `Ya existe un regalo con la referencia "${rc.reference}" en esta campaña.`,
            });
          }
        }
      }
    }

    // ── 4. Folder matching + image materialization (bounded) ───────────
    const folderPreviews: GiftImportFolderInfo[] = [];
    const referencedFolders = new Map<string, GiftImportRow[]>();

    for (const r of rows) {
      if (!r.folderKey) continue;
      const list = referencedFolders.get(r.folderKey) ?? [];
      list.push(r);
      referencedFolders.set(r.folderKey, list);
    }

    let totalImages = 0;
    const zip = zipResult.zip;

    for (const r of rows) {
      const folder = r.folderKey ? zipResult.folders.get(r.folderKey) : undefined;
      const preview: GiftImportFolderInfo = {
        row: r.excelRow,
        campaignSlug: r.campaignSlug,
        name: r.name,
        reference: r.reference,
        imageFolder: r.imageFolder,
        matched: !!folder,
        files: [],
      };

      if (!r.folderKey) {
        folderPreviews.push(preview);
        continue;
      }

      if (!folder) {
        if (zip !== null) {
          issues.push({
            row: r.excelRow,
            column: 'imageFolder',
            columnLabel: 'Carpeta de imágenes',
            value: r.imageFolder,
            severity: 'ERROR',
            code: GIFT_CODE.IMAGE_FOLDER_NOT_FOUND,
            message: `No se encontró la carpeta "${r.imageFolder}" dentro del ZIP.`,
          });
        }
        folderPreviews.push(preview);
        continue;
      }

      if (zip === null) {
        // Package already rejected; report no extra folder issues.
        folderPreviews.push({ ...preview, matched: false });
        continue;
      }

      // Only attribute per-folder image issues to the first referencing row.
      const isFirstRow = referencedFolders.get(r.folderKey)![0].excelRow === r.excelRow;

      // Nested directories (beyond the folder itself) are blocking.
      const nestedDirs = folder.dirs.filter((d) => d.segments.length > 1);
      const nestedFiles = folder.files.filter((f) => f.segments.length > 2);
      const directFiles = folder.files.filter((f) => f.segments.length === 2);

      if (isFirstRow && nestedDirs.length > 0) {
        issues.push({
          row: r.excelRow,
          column: 'imageFolder',
          columnLabel: 'Carpeta de imágenes',
          value: r.imageFolder,
          severity: 'ERROR',
          code: GIFT_CODE.NESTED_FOLDER_IN_IMAGE_FOLDER,
          message: `La carpeta "${r.imageFolder}" contiene subcarpetas (${nestedDirs[0].name}, ...). No se permiten carpetas anidadas.`,
        });
      }
      if (isFirstRow && nestedFiles.length > 0) {
        issues.push({
          row: r.excelRow,
          column: 'imageFolder',
          columnLabel: 'Carpeta de imágenes',
          value: r.imageFolder,
          severity: 'ERROR',
          code: GIFT_CODE.NESTED_FOLDER_IN_IMAGE_FOLDER,
          message: `La carpeta "${r.imageFolder}" contiene archivos dentro de subcarpetas (${nestedFiles[0].name}, ...).`,
        });
      }

      const osMetadata: ZipEntryMeta[] = [];
      const unsupported: ZipEntryMeta[] = [];
      const candidates: ZipEntryMeta[] = [];
      for (const f of directFiles) {
        if (isOsMetadataFile(f.fileName)) {
          osMetadata.push(f);
          continue;
        }
        if (/\.(jpe?g|png|webp)$/i.test(f.fileName)) {
          candidates.push(f);
        } else {
          unsupported.push(f);
        }
      }

      if (isFirstRow && osMetadata.length > 0) {
        issues.push({
          row: r.excelRow,
          column: 'imageFolder',
          columnLabel: 'Carpeta de imágenes',
          value: r.imageFolder,
          severity: 'WARNING',
          code: GIFT_CODE.OS_METADATA_IGNORED,
          message: `Se ignorarán archivos de sistema en "${r.imageFolder}": ${osMetadata.map((f) => f.fileName).join(', ')}.`,
        });
      }
      if (isFirstRow && unsupported.length > 0) {
        issues.push({
          row: r.excelRow,
          column: 'imageFolder',
          columnLabel: 'Carpeta de imágenes',
          value: r.imageFolder,
          severity: 'ERROR',
          code: GIFT_CODE.UNSUPPORTED_FILE_IN_IMAGE_FOLDER,
          message: `La carpeta "${r.imageFolder}" contiene archivos no permitidos: ${unsupported.map((f) => f.fileName).join(', ')}. Solo se permiten JPEG/PNG/WebP.`,
        });
      }
      if (
        isFirstRow &&
        candidates.length === 0 &&
        osMetadata.length === 0 &&
        unsupported.length === 0 &&
        nestedDirs.length === 0 &&
        nestedFiles.length === 0
      ) {
        issues.push({
          row: r.excelRow,
          column: 'imageFolder',
          columnLabel: 'Carpeta de imágenes',
          value: r.imageFolder,
          severity: 'WARNING',
          code: GIFT_CODE.IMAGE_FOLDER_EMPTY,
          message: `La carpeta "${r.imageFolder}" está vacía. El regalo se creará sin imágenes.`,
        });
      }
      if (isFirstRow && candidates.length > LIMITS.MAX_IMAGES_PER_GIFT) {
        issues.push({
          row: r.excelRow,
          column: 'imageFolder',
          columnLabel: 'Carpeta de imágenes',
          value: r.imageFolder,
          severity: 'ERROR',
          code: GIFT_CODE.TOO_MANY_IMAGES_IN_FOLDER,
          message: `La carpeta "${r.imageFolder}" contiene ${candidates.length} imágenes; el máximo es ${LIMITS.MAX_IMAGES_PER_GIFT} por regalo.`,
        });
      }

      // Only allowlist images up to the cap; extra ones are still errors above.
      const imagesToUse = candidates.slice(0, LIMITS.MAX_IMAGES_PER_GIFT);
      for (const f of imagesToUse) {
        try {
          const buffer = await inflateEntry(zip, f.name);
          if (buffer.length > LIMITS.MAX_IMAGE_BYTES) {
            if (isFirstRow) {
              issues.push({
                row: r.excelRow,
                column: 'imageFolder',
                columnLabel: 'Carpeta de imágenes',
                value: r.imageFolder,
                severity: 'ERROR',
                code: GIFT_CODE.IMAGE_TOO_LARGE_IN_ZIP,
                message: `La imagen "${f.name}" supera el tamaño máximo de ${LIMITS.MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
              });
            }
            preview.files.push({ name: f.fileName, size: buffer.length, mime: null });
            continue;
          }
          const mime = sniffImageType(buffer);
          if (!mime) {
            if (isFirstRow) {
              issues.push({
                row: r.excelRow,
                column: 'imageFolder',
                columnLabel: 'Carpeta de imágenes',
                value: r.imageFolder,
                severity: 'ERROR',
                code: GIFT_CODE.IMAGE_DECODE_FAILED,
                message: `La imagen "${f.name}" no es un archivo JPEG/PNG/WebP válido.`,
              });
            }
            preview.files.push({ name: f.fileName, size: buffer.length, mime: null });
            continue;
          }
          preview.files.push({ name: f.fileName, size: buffer.length, mime });
          if (isFirstRow) {
            const images = r.images;
            images.push({ name: f.fileName, size: buffer.length, mime, buffer });
          }
        } catch {
          if (isFirstRow) {
            issues.push({
              row: r.excelRow,
              column: 'imageFolder',
              columnLabel: 'Carpeta de imágenes',
              value: r.imageFolder,
              severity: 'ERROR',
              code: GIFT_CODE.IMAGE_DECODE_FAILED,
              message: `No se pudo leer la imagen "${f.name}".`,
            });
          }
          preview.files.push({ name: f.fileName, size: 0, mime: null });
        }
      }

      if (isFirstRow) {
        totalImages += preview.files.filter((f) => f.mime !== null).length;
      }
      folderPreviews.push(preview);
    }

    // Unreferenced folders (present in ZIP, no row references them).
    if (zip !== null) {
      for (const [key, folder] of zipResult.folders) {
        if (referencedFolders.has(key)) continue;
        if (key === '__macosx') continue; // OS metadata folder already ignorable
        issues.push({
          row: 1,
          column: 'zip',
          columnLabel: 'ZIP',
          value: folder.display,
          severity: 'WARNING',
          code: GIFT_CODE.ZIP_UNREFERENCED_FOLDER,
          message: `La carpeta "${folder.display}" del ZIP no está referenciada por ninguna fila del Excel y se ignorará.`,
        });
      }
    }

    if (totalImages > LIMITS.MAX_IMAGES) {
      issues.push({
        row: 2,
        column: 'imageFolder',
        columnLabel: 'Carpeta de imágenes',
        value: null,
        severity: 'ERROR',
        code: GIFT_CODE.IMAGE_LIMIT_EXCEEDED,
        message: `El paquete contiene ${totalImages} imágenes; el máximo permitido es ${LIMITS.MAX_IMAGES}.`,
      });
    }

    // Cross-row duplicates (campaign + reference) after normalization.
    issues.push(...detectDuplicateReferences(rows));

    // Re-write campaignId only for rows that passed campaign existence checks.
    for (const r of rows) {
      if (campaignBySlug.has(r.campaignSlug)) {
        r.campaignId = campaignBySlug.get(r.campaignSlug)!.id;
      }
    }

    const canImport = !hasBlockingErrors(issues);

    return {
      canImport,
      rows,
      issues,
      warningCount: issues.filter((i) => i.severity === 'WARNING').length,
      folderPreviews,
      totalImages,
    };
  }

  /**
   * Compensated cleanup for a failed commit attempt: remove every Storage
   * object, GiftImage row and Gift created by THIS attempt. Continues even if
   * one cleanup action fails (each failure is logged) and never touches
   * pre-existing data. The original error is preserved by the caller.
   */
  private async compensate(
    createdGifts: Array<{ id: number; campaignId: number }>,
    uploadedPaths: string[],
    originalError: unknown,
  ): Promise<void> {
    this.logger.error(
      `Import commit failed; starting compensation. ` +
        `gifts=${createdGifts.length} storageObjects=${uploadedPaths.length}. ` +
        (originalError instanceof Error ? originalError.message : String(originalError)),
    );

    // 1) Delete every Storage object uploaded by this attempt.
    const deletionTasks = uploadedPaths.map(async (path) => {
      try {
        await this.storage.deleteFile(path);
      } catch (e) {
        this.logger.warn(
          `compensation: storage delete failed for ${path}: ${(e as Error)?.message}`,
        );
      }
    });
    await Promise.all(deletionTasks);

    const ids = createdGifts.map((g) => g.id);
    if (ids.length > 0) {
      // 2) Delete GiftImage rows created by this attempt (explicit, before gifts).
      try {
        await this.prisma.giftImage.deleteMany({
          where: { giftId: { in: ids } },
        });
      } catch (e) {
        this.logger.warn(
          `compensation: giftImage delete failed: ${(e as Error)?.message}`,
        );
      }
      // 3) Delete gifts created by this attempt (GiftImage cascade covers any
      //    leftover rows). New gifts have no selections, so hard delete is safe.
      try {
        await this.prisma.gift.deleteMany({ where: { id: { in: ids } } });
      } catch (e) {
        this.logger.warn(
          `compensation: gift delete failed: ${(e as Error)?.message}`,
        );
      }
    }
  }
}

/**
 * Like runWithConcurrency but runs every item to completion (bounded pool),
 * collects each worker result in order, and reports per-item failures instead
 * of aborting on the first rejection. This guarantees that when a commit is
 * compensated, every upload that already succeeded has been awaited and
 * tracked, and the original failure is preserved.
 */
async function runWithConcurrencyCollect<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<{ results: R[]; failures: Error[] }> {
  const results: R[] = new Array(items.length);
  const failures: Error[] = [];
  let idx = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (idx < items.length) {
        const cur = idx++;
        try {
          results[cur] = await worker(items[cur], cur);
        } catch (e) {
          failures.push(e as Error);
        }
      }
    },
  );
  await Promise.all(runners);
  return { results, failures };
}

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';

interface ImportRow {
  campaignSlug: string;
  employeeDocumentId: string;
  employeeFullName: string;
  employeeEmail?: string;
  employeePhone?: string;
  shippingAddress?: string;
  shippingCity?: string;
  beneficiaryFullName: string;
  beneficiaryAge: number;
  beneficiaryGender: string;
}

interface ImportError {
  row: number;
  message: string;
}

interface ImportWarning {
  row: number;
  message: string;
}

export interface ImportResult {
  totalRows: number;
  employeesCreated: number;
  employeesUpdated: number;
  beneficiariesCreated: number;
  skippedRows: number;
  errors: ImportError[];
  warnings: ImportWarning[];
}

const EXPECTED_HEADERS = [
  'campaignSlug',
  'employeeDocumentId',
  'employeeFullName',
  'employeeEmail',
  'employeePhone',
  'shippingAddress',
  'shippingCity',
  'beneficiaryFullName',
  'beneficiaryAge',
  'beneficiaryGender',
];

function normalizeGender(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (v === 'male' || v === 'masculino' || v === 'm') return 'male';
  if (v === 'female' || v === 'femenino' || v === 'f') return 'female';
  return null;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Normalizes an ExcelJS cell value to a plain primitive, unwrapping rich text,
 * formula results and hyperlinks so downstream string/number parsing matches
 * the previous sheet_to_json behavior.
 */
function cellToValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const v = value as unknown as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[])
        .map((t) => t.text ?? '')
        .join('');
    }
    if ('result' in v) return v.result ?? '';
    if ('text' in v) return v.text ?? '';
    return String(value);
  }
  return value;
}

@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}

  async importEmployeesBeneficiaries(
    file: Express.Multer.File,
    adminUserId: number,
  ): Promise<ImportResult> {
    if (!file) {
      throw new BadRequestException('El archivo es obligatorio.');
    }

    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('El archivo debe ser un Excel (.xlsx).');
    }

    // ── 1. Parse workbook ──────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException(
        'El archivo Excel no pudo leerse o está dañado.',
      );
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('El archivo Excel no contiene hojas.');
    }

    // Map header row (row 1) to column indexes, then build one object per data row.
    const headers: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
      headers[col] = String(cellToValue(cell.value) ?? '').trim();
    });

    const rawRows: Record<string, unknown>[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // skip header row
      const obj: Record<string, unknown> = {};
      for (let col = 1; col < headers.length; col++) {
        const key = headers[col];
        if (!key) continue;
        obj[key] = cellToValue(row.getCell(col).value);
      }
      rawRows.push(obj);
    });

    if (rawRows.length === 0) {
      return {
        totalRows: 0,
        employeesCreated: 0,
        employeesUpdated: 0,
        beneficiariesCreated: 0,
        skippedRows: 0,
        errors: [],
        warnings: [],
      };
    }

    // ── 2. Validate headers ────────────────────────────────
    const fileHeaders = Object.keys(rawRows[0]).map((h) => h.trim());
    const missingHeaders = EXPECTED_HEADERS.filter(
      (h) => !fileHeaders.includes(h),
    );
    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `El archivo Excel debe contener las columnas esperadas. Faltan: ${missingHeaders.join(', ')}.`,
      );
    }

    // ── 3. First pass: validate & normalize all rows ───────
    const errors: ImportError[] = [];
    const validRows: (ImportRow & { excelRow: number })[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const excelRow = i + 2; // header is row 1
      const r = rawRows[i];

      const campaignSlug = String(r['campaignSlug'] ?? '').trim();
      const employeeDocumentId = String(r['employeeDocumentId'] ?? '').trim();
      const employeeFullName = String(r['employeeFullName'] ?? '').trim();
      const employeeEmail =
        String(r['employeeEmail'] ?? '').trim().toLowerCase() || undefined;
      const employeePhone =
        String(r['employeePhone'] ?? '').trim() || undefined;
      const shippingAddress =
        String(r['shippingAddress'] ?? '').trim() || undefined;
      const shippingCity =
        String(r['shippingCity'] ?? '').trim() || undefined;
      const beneficiaryFullName = String(
        r['beneficiaryFullName'] ?? '',
      ).trim();
      const beneficiaryAgeRaw = r['beneficiaryAge'];
      const beneficiaryGenderRaw = String(
        r['beneficiaryGender'] ?? '',
      ).trim();

      // Required validations
      if (!campaignSlug) {
        errors.push({
          row: excelRow,
          message: 'El campaignSlug es obligatorio.',
        });
        continue;
      }
      if (!employeeDocumentId) {
        errors.push({
          row: excelRow,
          message: 'El employeeDocumentId es obligatorio.',
        });
        continue;
      }
      if (!employeeFullName) {
        errors.push({
          row: excelRow,
          message: 'El employeeFullName es obligatorio.',
        });
        continue;
      }
      if (!beneficiaryFullName) {
        errors.push({
          row: excelRow,
          message: 'El beneficiaryFullName es obligatorio.',
        });
        continue;
      }

      const ageNum = Number(beneficiaryAgeRaw);
      if (
        !Number.isInteger(ageNum) ||
        ageNum < 0 ||
        ageNum > 13
      ) {
        errors.push({
          row: excelRow,
          message: 'La edad del beneficiario debe ser un número entero entre 0 y 13.',
        });
        continue;
      }
      const beneficiaryAge = ageNum;

      const beneficiaryGender = normalizeGender(beneficiaryGenderRaw);
      if (!beneficiaryGender) {
        errors.push({
          row: excelRow,
          message:
            'El género del beneficiario debe ser male/female (o masculino/femenino).',
        });
        continue;
      }

      validRows.push({
        excelRow,
        campaignSlug,
        employeeDocumentId,
        employeeFullName,
        employeeEmail,
        employeePhone,
        shippingAddress,
        shippingCity,
        beneficiaryFullName,
        beneficiaryAge,
        beneficiaryGender,
      });
    }

    // ── 4. Preload campaigns by slug ───────────────────────
    const slugs = [...new Set(validRows.map((r) => r.campaignSlug))];
    const campaigns = await this.prisma.campaign.findMany({
      where: { slug: { in: slugs }, deletedAt: null },
      select: { id: true, slug: true, status: true },
    });
    const campaignBySlug = new Map<string, { id: number; status: string }>();
    for (const c of campaigns) {
      campaignBySlug.set(c.slug, { id: c.id, status: c.status });
    }

    // Remove rows whose campaign doesn't exist or isn't open for loading.
    const rowsWithCampaign: (ImportRow & {
      excelRow: number;
      campaignId: number;
    })[] = [];
    for (const row of validRows) {
      const c = campaignBySlug.get(row.campaignSlug);
      if (!c) {
        errors.push({
          row: row.excelRow,
          message: `La campaña "${row.campaignSlug}" no existe o fue eliminada.`,
        });
        continue;
      }
      if (c.status !== 'DRAFT' && c.status !== 'ACTIVE') {
        errors.push({
          row: row.excelRow,
          message: `La campaña "${row.campaignSlug}" no admite cargas (estado ${c.status}).`,
        });
        continue;
      }
      rowsWithCampaign.push({ ...row, campaignId: c.id });
    }

    // ── 5. Group by (campaignId, employeeDocumentId) ───────
    const groupKey = (cid: number, doc: string) => `${cid}::${doc}`;
    const groups = new Map<
      string,
      {
        campaignId: number;
        documentId: string;
        employeeFullName: string;
        employeeEmail?: string;
        employeePhone?: string;
        shippingAddress?: string;
        shippingCity?: string;
        rows: (ImportRow & { excelRow: number; campaignId: number })[];
      }
    >();

    for (const row of rowsWithCampaign) {
      const key = groupKey(row.campaignId, row.employeeDocumentId);
      const existing = groups.get(key);
      if (existing) {
        existing.rows.push(row);
      } else {
        groups.set(key, {
          campaignId: row.campaignId,
          documentId: row.employeeDocumentId,
          employeeFullName: row.employeeFullName,
          employeeEmail: row.employeeEmail,
          employeePhone: row.employeePhone,
          shippingAddress: row.shippingAddress,
          shippingCity: row.shippingCity,
          rows: [row],
        });
      }
    }

    // ── 6. Process employee groups in batches ───────────────
    // Split groups into batches to avoid long-running transactions
    // that exceed the Supabase pooler timeout.
    const BATCH_SIZE = 10;
    const BATCH_TIMEOUT = 120000;
    const logger = new Logger('Import');

    const groupArray = Array.from(groups.values());
    const batches: typeof groupArray[] = [];
    for (let i = 0; i < groupArray.length; i += BATCH_SIZE) {
      batches.push(groupArray.slice(i, i + BATCH_SIZE));
    }

    let employeesCreated = 0;
    let employeesUpdated = 0;
    let beneficiariesCreated = 0;
    let skippedRows = 0;
    const warnings: ImportWarning[] = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      logger.log(`batch ${batchIndex + 1}/${batches.length} started (${batch.length} groups)`);

      const batchResult = await this.prisma.$transaction(
        async (tx) => {
          let ec = 0;
          let eu = 0;
          let bc = 0;
          let sr = 0;
          const w: ImportWarning[] = [];

          // ── 6a. Bulk fetch existing employees for this batch ──
          const campaignIds = [...new Set(batch.map((g) => g.campaignId))];
          const documentIds = [...new Set(batch.map((g) => g.documentId))];
          const existingEmployees = await tx.employee.findMany({
            where: {
              campaignId: { in: campaignIds },
              documentId: { in: documentIds },
            },
          });
          const empMap = new Map<string, typeof existingEmployees[number]>();
          for (const emp of existingEmployees) {
            empMap.set(`${emp.campaignId}::${emp.documentId}`, emp);
          }

          // ── 6b. Classify groups and prepare create payload ──
          type GroupInfo = { group: typeof batch[0]; isConfirmed: boolean };
          const groupInfos: GroupInfo[] = [];
          const createPayload: Array<{
            campaignId: number;
            documentId: string;
            fullName: string;
            email: string | null;
            phone: string | null;
            shippingAddress: string | null;
            shippingCity: string | null;
            status: 'PENDING';
            createdById: number;
          }> = [];
          const updateActions: Array<{ id: number; data: Record<string, unknown> }> = [];

          for (const group of batch) {
            const key = `${group.campaignId}::${group.documentId}`;
            const employee = empMap.get(key);

            if (employee) {
              if (employee.status === 'CONFIRMED') {
                groupInfos.push({ group, isConfirmed: true });
                continue;
              }

              const updateData: Record<string, unknown> = {};
              if (employee.fullName !== group.employeeFullName) {
                updateData.fullName = group.employeeFullName;
              }
              if (group.employeeEmail !== undefined) {
                const target = group.employeeEmail || null;
                if ((employee.email ?? null) !== target) {
                  updateData.email = target;
                }
              }
              if (group.employeePhone !== undefined) {
                const target = group.employeePhone || null;
                if ((employee.phone ?? null) !== target) {
                  updateData.phone = target;
                }
              }
              if (group.shippingAddress !== undefined) {
                const target = group.shippingAddress || null;
                if ((employee.shippingAddress ?? null) !== target) {
                  updateData.shippingAddress = target;
                }
              }
              if (group.shippingCity !== undefined) {
                const target = group.shippingCity || null;
                if ((employee.shippingCity ?? null) !== target) {
                  updateData.shippingCity = target;
                }
              }

              if (Object.keys(updateData).length > 0) {
                updateActions.push({ id: employee.id, data: updateData });
              }
              groupInfos.push({ group, isConfirmed: false });
            } else {
              createPayload.push({
                campaignId: group.campaignId,
                documentId: group.documentId,
                fullName: group.employeeFullName,
                email: group.employeeEmail || null,
                phone: group.employeePhone || null,
                shippingAddress: group.shippingAddress || null,
                shippingCity: group.shippingCity || null,
                status: 'PENDING' as const,
                createdById: adminUserId,
              });
              groupInfos.push({ group, isConfirmed: false });
            }
          }

          // ── 6c. Batch create new employees ──
          if (createPayload.length > 0) {
            const createResult = await tx.employee.createMany({
              data: createPayload,
              skipDuplicates: true,
            });
            ec = createResult.count;
          }

          // ── 6d. Re-fetch batch employees to get IDs ──
          const freshEmployees = await tx.employee.findMany({
            where: {
              campaignId: { in: campaignIds },
              documentId: { in: documentIds },
            },
          });
          const freshEmpMap = new Map<string, typeof freshEmployees[number]>();
          for (const emp of freshEmployees) {
            freshEmpMap.set(`${emp.campaignId}::${emp.documentId}`, emp);
          }

          // ── 6e. Apply individual employee updates ──
          for (const action of updateActions) {
            await tx.employee.update({
              where: { id: action.id },
              data: { ...action.data, updatedById: adminUserId },
            });
            eu++;
          }

          // ── 6f. Bulk beneficiary processing ──
          // Collect employee IDs for non-CONFIRMED groups
          const nonConfirmedEmployeeIds: number[] = [];
          for (const { group, isConfirmed } of groupInfos) {
            if (isConfirmed) continue;
            const key = `${group.campaignId}::${group.documentId}`;
            const emp = freshEmpMap.get(key);
            if (emp) {
              nonConfirmedEmployeeIds.push(emp.id);
            }
          }

          // One query: fetch all existing beneficiaries for this batch
          const existingBeneficiaries = nonConfirmedEmployeeIds.length > 0
            ? await tx.beneficiary.findMany({
                where: {
                  employeeId: { in: nonConfirmedEmployeeIds },
                  deletedAt: null,
                },
                select: { employeeId: true, fullName: true, age: true, gender: true },
              })
            : [];

          const existingBenSet = new Set<string>();
          for (const b of existingBeneficiaries) {
            existingBenSet.add(
              `${b.employeeId}::${normalizeName(b.fullName)}::${b.age}::${b.gender}`,
            );
          }

          // In-memory pass: classify rows, build createMany payload
          const beneficiaryCreatePayload: Array<{
            employeeId: number;
            fullName: string;
            age: number;
            gender: 'male' | 'female';
            createdById: number;
          }> = [];
          const currentBatchDupSet = new Set<string>();

          for (const { group, isConfirmed } of groupInfos) {
            if (isConfirmed) {
              for (const r of group.rows) {
                w.push({
                  row: r.excelRow,
                  message:
                    'El empleado ya estaba confirmado y no fue actualizado.',
                });
                sr++;
              }
              continue;
            }

            const key = `${group.campaignId}::${group.documentId}`;
            const employee = freshEmpMap.get(key);
            if (!employee) continue;

            for (const row of group.rows) {
              const normName = normalizeName(row.beneficiaryFullName);
              const dupKey = `${employee.id}::${normName}::${row.beneficiaryAge}::${row.beneficiaryGender}`;

              if (existingBenSet.has(dupKey)) {
                w.push({
                  row: row.excelRow,
                  message: `El beneficiario "${row.beneficiaryFullName}" (${row.beneficiaryAge}, ${row.beneficiaryGender}) ya existe para este empleado.`,
                });
                sr++;
                continue;
              }

              if (currentBatchDupSet.has(dupKey)) {
                w.push({
                  row: row.excelRow,
                  message: `El beneficiario "${row.beneficiaryFullName}" (${row.beneficiaryAge}, ${row.beneficiaryGender}) ya está duplicado en este archivo.`,
                });
                sr++;
                continue;
              }

              beneficiaryCreatePayload.push({
                employeeId: employee.id,
                fullName: row.beneficiaryFullName,
                age: row.beneficiaryAge,
                gender: row.beneficiaryGender as 'male' | 'female',
                createdById: adminUserId,
              });
              currentBatchDupSet.add(dupKey);
            }
          }

          // One query: create all new beneficiaries
          if (beneficiaryCreatePayload.length > 0) {
            const benResult = await tx.beneficiary.createMany({
              data: beneficiaryCreatePayload,
              skipDuplicates: true,
            });
            bc = benResult.count;
          }

          return { ec, eu, bc, sr, w };
        },
        { timeout: BATCH_TIMEOUT, maxWait: 20000 },
      );

      employeesCreated += batchResult.ec;
      employeesUpdated += batchResult.eu;
      beneficiariesCreated += batchResult.bc;
      skippedRows += batchResult.sr;
      warnings.push(...batchResult.w);

      logger.log(`batch ${batchIndex + 1}/${batches.length} completed`);
    }

    return {
      totalRows: rawRows.length,
      employeesCreated,
      employeesUpdated,
      beneficiariesCreated,
      skippedRows,
      errors,
      warnings,
    };
  }
}

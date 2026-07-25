import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import {
  ImportIssue,
  NormalizedRow,
  MAX_CAMPAIGN_SLUG_LEN,
  MAX_EMPLOYEE_NAME_LEN,
  MAX_EMAIL_LEN,
  MAX_PHONE_LEN,
  MAX_DOCUMENT_LEN,
  MAX_ADDRESS_LEN,
  MAX_CITY_LEN,
  MAX_BENEFICIARY_NAME_LEN,
  buildBeneficiaryKey,
  buildEmployeeInfoTuple,
  buildEmployeeKey,
  checkBeneficiaryAge,
  checkBeneficiaryGender,
  checkDocument,
  checkEmail,
  checkMaxLength,
  checkPhone,
  checkRequired,
  detectCrossRowIssues,
  normalizeGender,
  normalizeName,
  validateHeaders,
} from './import-validation';

interface ImportWarning {
  row: number;
  message: string;
}

export interface ImportResult {
  /** false when at least one ERROR-severity issue was found (atomic rule). */
  canImport: boolean;
  totalRows: number;
  employeesCreated: number;
  employeesUpdated: number;
  beneficiariesCreated: number;
  /** Present for forward-compat; always 0 in the current importer. */
  beneficiariesUpdated: number;
  skippedRows: number;
  /** ERROR-severity issues (rich shape, backward-compatible: each has row+message). */
  errors: ImportIssue[];
  /** WARNING-severity issues (legacy shape: row+message). */
  warnings: ImportWarning[];
  /** ALL issues (errors + warnings) in rich shape, for detailed UI reporting. */
  issues: ImportIssue[];
  /** Numerical counts for structured performance timing metadata. */
  errorCount: number;
  warningCount: number;
}

/**
 * Normalize an ExcelJS cell value to a plain primitive, unwrapping rich text,
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

/** Backward-compatible legacy shape, used where the UI reads {row,message}. */
function toLegacyWarning(issue: ImportIssue): ImportWarning {
  return { row: issue.row, message: issue.message };
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

    interface RawRow {
      excelRow: number;
      rawIndex: number;
      data: Record<string, unknown>;
    }
    const rawRows: RawRow[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // skip header row
      const obj: Record<string, unknown> = {};
      for (let col = 1; col < headers.length; col++) {
        const key = headers[col];
        if (!key) continue;
        obj[key] = cellToValue(row.getCell(col).value);
      }
      rawRows.push({ excelRow: rowNumber, rawIndex: rowNumber - 2, data: obj });
    });

    const totalRows = rawRows.length;

    // Empty file: nothing to validate, nothing to write.
    if (totalRows === 0) {
      return {
        canImport: true,
        totalRows: 0,
        employeesCreated: 0,
        employeesUpdated: 0,
        beneficiariesCreated: 0,
        beneficiariesUpdated: 0,
        skippedRows: 0,
        errors: [],
        warnings: [],
        issues: [],
        errorCount: 0,
        warningCount: 0,
      };
    }

    // ── 2. Validate headers ────────────────────────────────
    const fileHeaders = Object.keys(rawRows[0].data);
    const issues: ImportIssue[] = [...validateHeaders(fileHeaders)];

    // ── 3. First pass: validate & normalize every row & column ───
    const normalizedRows: NormalizedRow[] = [];
    for (const rr of rawRows) {
      const excelRow = rr.excelRow;
      const r = rr.data;

      const campaignSlug = String(r['campaignSlug'] ?? '').trim();
      const employeeDocumentId = String(r['employeeDocumentId'] ?? '').trim();
      const employeeFullName = String(r['employeeFullName'] ?? '').trim();
      const employeeEmailRaw = String(r['employeeEmail'] ?? '').trim();
      const employeeEmail = employeeEmailRaw ? employeeEmailRaw.toLowerCase() : null;
      const employeePhoneRaw = String(r['employeePhone'] ?? '').trim();
      const employeePhone = employeePhoneRaw || null;
      const shippingAddressRaw = String(r['shippingAddress'] ?? '').trim();
      const shippingAddress = shippingAddressRaw || null;
      const shippingCityRaw = String(r['shippingCity'] ?? '').trim();
      const shippingCity = shippingCityRaw || null;
      const beneficiaryFullName = String(r['beneficiaryFullName'] ?? '').trim();
      const beneficiaryAgeRaw = r['beneficiaryAge'];
      const beneficiaryGenderRaw = String(r['beneficiaryGender'] ?? '').trim();

      // Required field checks (independent; never stop on first failure).
      const requiredIssues = [
        checkRequired(
          excelRow,
          'campaignSlug',
          campaignSlug,
          'El slug de la campaña es obligatorio.',
        ),
        checkRequired(
          excelRow,
          'employeeDocumentId',
          employeeDocumentId,
          'El documento del empleado es obligatorio.',
        ),
        checkRequired(
          excelRow,
          'employeeFullName',
          employeeFullName,
          'El nombre del empleado es obligatorio.',
        ),
        checkRequired(
          excelRow,
          'beneficiaryFullName',
          beneficiaryFullName,
          'El nombre del beneficiario es obligatorio.',
        ),
      ].filter((i): i is ImportIssue => i !== null);
      issues.push(...requiredIssues);

      // Length checks (independent).
      const lengthIssues = [
        checkMaxLength(
          excelRow,
          'campaignSlug',
          campaignSlug,
          MAX_CAMPAIGN_SLUG_LEN,
          `El slug de la campaña no puede superar los ${MAX_CAMPAIGN_SLUG_LEN} caracteres.`,
        ),
        checkMaxLength(
          excelRow,
          'employeeFullName',
          employeeFullName,
          MAX_EMPLOYEE_NAME_LEN,
          `El nombre del empleado no puede superar los ${MAX_EMPLOYEE_NAME_LEN} caracteres.`,
        ),
        checkMaxLength(
          excelRow,
          'shippingAddress',
          shippingAddressRaw,
          MAX_ADDRESS_LEN,
          `La dirección de entrega no puede superar los ${MAX_ADDRESS_LEN} caracteres.`,
        ),
        checkMaxLength(
          excelRow,
          'shippingCity',
          shippingCityRaw,
          MAX_CITY_LEN,
          `La ciudad no puede superar los ${MAX_CITY_LEN} caracteres.`,
        ),
        checkMaxLength(
          excelRow,
          'beneficiaryFullName',
          beneficiaryFullName,
          MAX_BENEFICIARY_NAME_LEN,
          `El nombre del beneficiario no puede superar los ${MAX_BENEFICIARY_NAME_LEN} caracteres.`,
        ),
      ].filter((i): i is ImportIssue => i !== null);
      issues.push(...lengthIssues);

      // Document format/length (digits-only, 6-10).
      if (employeeDocumentId.trim() !== '') {
        issues.push(...checkDocument(excelRow, 'employeeDocumentId', employeeDocumentId));
      }
      // VarChar(50) technical safety for the document (in addition to the
      // business 6-10 rule, kept as a hard DB guard).
      const docLen = checkMaxLength(
        excelRow,
        'employeeDocumentId',
        employeeDocumentId,
        MAX_DOCUMENT_LEN,
        `El documento del empleado no puede superar los ${MAX_DOCUMENT_LEN} caracteres.`,
      );
      if (docLen) issues.push(docLen);

      // Email (optional in this importer, per the audit).
      issues.push(
        ...checkEmail(excelRow, 'employeeEmail', employeeEmailRaw, false),
      );

      // Phone (optional in this importer, per the audit).
      issues.push(
        ...checkPhone(excelRow, 'employeePhone', employeePhoneRaw, false),
      );

      // Beneficiary age + gender (required).
      issues.push(...checkBeneficiaryAge(excelRow, 'beneficiaryAge', beneficiaryAgeRaw));
      issues.push(
        ...checkBeneficiaryGender(excelRow, 'beneficiaryGender', beneficiaryGenderRaw),
      );

      // Build normalized values for cross-row checks (only when complete).
      const ageText = String(beneficiaryAgeRaw ?? '').trim();
      let safeAge: number | null = null;
      if (ageText !== '') {
        const n = Number(ageText);
        if (Number.isInteger(n) && n >= 0 && n <= 13) safeAge = n;
      }
      const genderNorm = normalizeGender(beneficiaryGenderRaw);

      const employeeKey = buildEmployeeKey(campaignSlug, employeeDocumentId);
      const beneficiaryKey = buildBeneficiaryKey(
        employeeKey,
        beneficiaryFullName,
        safeAge,
        genderNorm,
      );
      const employeeInfoTuple = employeeKey
        ? buildEmployeeInfoTuple(
            employeeFullName,
            employeeEmail,
            employeePhone,
            shippingAddress,
            shippingCity,
          )
        : null;

      normalizedRows.push({
        excelRow,
        rawIndex: rr.rawIndex,
        campaignSlug,
        employeeDocumentId,
        employeeFullName,
        employeeEmail,
        employeePhone,
        shippingAddress,
        shippingCity,
        beneficiaryFullName,
        beneficiaryAge: safeAge,
        beneficiaryGender: genderNorm,
        employeeKey,
        beneficiaryKey,
        employeeInfoTuple,
      });
    }

    // ── 4. Cross-row validation (duplicates + conflicts) ────
    issues.push(...detectCrossRowIssues(normalizedRows));

    // ── 5. Campaign existence + status (DB read, never a write) ──
    const slugs = [...new Set(
      normalizedRows
        .map((r) => r.campaignSlug)
        .filter((s) => s.trim() !== ''),
    )];
    // Fetched once and reused for the happy-path grouping (no second query).
    const campaignBySlug = new Map<string, { id: number; status: string }>();
    if (slugs.length > 0) {
      const campaigns = await this.prisma.campaign.findMany({
        where: { slug: { in: slugs }, deletedAt: null },
        select: { id: true, slug: true, status: true },
      });
      for (const c of campaigns) {
        campaignBySlug.set(c.slug, { id: c.id, status: c.status });
      }
      const foundSlugs = new Set(campaigns.map((c) => c.slug));
      const statusByKey = new Map(campaigns.map((c) => [c.slug, c.status] as const));

      for (const row of normalizedRows) {
        const slug = row.campaignSlug;
        if (slug.trim() === '') continue; // missing already reported
        if (!foundSlugs.has(slug)) {
          issues.push({
            row: row.excelRow,
            column: 'campaignSlug',
            columnLabel: 'Campaña (slug)',
            value: slug,
            severity: 'ERROR',
            code: 'CAMPAIGN_NOT_FOUND',
            message: `La campaña "${slug}" no existe o fue eliminada.`,
          });
          continue;
        }
        const status = statusByKey.get(slug);
        if (!status) continue;
        if (status !== 'DRAFT' && status !== 'ACTIVE') {
          issues.push({
            row: row.excelRow,
            column: 'campaignSlug',
            columnLabel: 'Campaña (slug)',
            value: slug,
            severity: 'ERROR',
            code: 'CAMPAIGN_STATUS_NOT_OPEN',
            message: `La campaña "${slug}" no admite cargas (estado ${status}).`,
          });
        }
      }
    }

    // ── 6. Atomic rule ─────────────────────────────────────
    const errorIssues = issues.filter((i) => i.severity === 'ERROR');
    const warningIssues = issues.filter((i) => i.severity === 'WARNING');

    if (errorIssues.length > 0) {
      // ZERO database writes may be performed.
      return {
        canImport: false,
        totalRows,
        employeesCreated: 0,
        employeesUpdated: 0,
        beneficiariesCreated: 0,
        beneficiariesUpdated: 0,
        skippedRows: 0,
        errors: errorIssues,
        warnings: warningIssues.map(toLegacyWarning),
        issues,
        errorCount: errorIssues.length,
        warningCount: warningIssues.length,
      };
    }

    // ── 7. Happy path: group by (campaignId, employeeDocumentId) & batch ──
    // Only rows that passed all validations reach here. Confirmed employees
    // and already-existing beneficiaries produce non-blocking warnings and
    // are skipped (no DB write) — this preserves idempotent re-upload.
    const rowsWithCampaign = normalizedRows
      .filter((r) => r.campaignSlug && campaignBySlug.has(r.campaignSlug))
      .map((r) => ({
        ...r,
        campaignId: campaignBySlug.get(r.campaignSlug)!.id,
      }));

    const groupKey = (cid: number, doc: string) => `${cid}::${doc}`;
    const groups = new Map<
      string,
      {
        campaignId: number;
        documentId: string;
        employeeFullName: string;
        employeeEmail?: string | null;
        employeePhone?: string | null;
        shippingAddress?: string | null;
        shippingCity?: string | null;
        rows: (typeof rowsWithCampaign[number])[];
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

    // ── 8. Process employee groups in batches ───────────────
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
    const importWarnings: ImportWarning[] = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      logger.log(`batch ${batchIndex + 1}/${batches.length} started (${batch.length} groups)`);

      const batchResult = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          let ec = 0;
          let eu = 0;
          let bc = 0;
          let sr = 0;
          const w: ImportWarning[] = [];

          // ── 8a. Bulk fetch existing employees for this batch ──
          const campaignIds = [...new Set(batch.map((g) => g.campaignId))];
          const documentIds = [...new Set(batch.map((g) => g.documentId))];
          const existingEmployees = await tx.employee.findMany({
            where: {
              campaignId: { in: campaignIds },
              documentId: { in: documentIds },
            },
          });
          const empMap = new Map<string, (typeof existingEmployees)[number]>();
          for (const emp of existingEmployees) {
            empMap.set(`${emp.campaignId}::${emp.documentId}`, emp);
          }

          // ── 8b. Classify groups and prepare create payload ──
          const groupInfos: Array<{ group: (typeof batch)[number]; isConfirmed: boolean }> = [];
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

          // ── 8c. Batch create new employees ──
          if (createPayload.length > 0) {
            const createResult = await tx.employee.createMany({
              data: createPayload,
              skipDuplicates: true,
            });
            ec = createResult.count;
          }

          // ── 8d. Re-fetch batch employees to get IDs ──
          const freshEmployees = await tx.employee.findMany({
            where: {
              campaignId: { in: campaignIds },
              documentId: { in: documentIds },
            },
          });
          const freshEmpMap = new Map<string, (typeof freshEmployees)[number]>();
          for (const emp of freshEmployees) {
            freshEmpMap.set(`${emp.campaignId}::${emp.documentId}`, emp);
          }

          // ── 8e. Apply individual employee updates ──
          for (const action of updateActions) {
            await tx.employee.update({
              where: { id: action.id },
              data: { ...action.data, updatedById: adminUserId },
            });
            eu++;
          }

          // ── 8f. Bulk beneficiary processing ──
          const nonConfirmedEmployeeIds: number[] = [];
          for (const { group, isConfirmed } of groupInfos) {
            if (isConfirmed) continue;
            const key = `${group.campaignId}::${group.documentId}`;
            const emp = freshEmpMap.get(key);
            if (emp) {
              nonConfirmedEmployeeIds.push(emp.id);
            }
          }

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
                  message: 'El empleado ya estaba confirmado y no fue actualizado.',
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
                age: row.beneficiaryAge as number,
                gender: row.beneficiaryGender as 'male' | 'female',
                createdById: adminUserId,
              });
              currentBatchDupSet.add(dupKey);
            }
          }

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
      importWarnings.push(...batchResult.w);

      logger.log(`batch ${batchIndex + 1}/${batches.length} completed`);
    }

    return {
      canImport: true,
      totalRows,
      employeesCreated,
      employeesUpdated,
      beneficiariesCreated,
      beneficiariesUpdated: 0,
      skippedRows,
      errors: [],
      warnings: importWarnings,
      issues: [],
      errorCount: 0,
      warningCount: importWarnings.length,
    };
  }
}
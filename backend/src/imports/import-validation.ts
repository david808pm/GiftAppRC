/**
 * Pure validation layer for the employee + beneficiary Excel import.
 *
 * Design goals (per the approved import spec):
 *  - Validate the COMPLETE file before any database write.
 *  - Collect and report every detected issue with: visible Excel row number,
 *    column, received value, severity, stable error code, clear Spanish message.
 *  - Atomic rule: if there is at least one ERROR-severity issue, the import is
 *    rejected (`canImport=false`) and zero Prisma write methods may be called.
 *
 * Every function in this module is pure (no I/O, no DB, no ExcelJS) so the full
 * validation contract is covered by fast unit tests.
 */

export type IssueSeverity = 'ERROR' | 'WARNING';

export const ERROR: IssueSeverity = 'ERROR';
export const WARNING: IssueSeverity = 'WARNING';

export interface ImportIssue {
  /** Visible Excel row number. Header row is 1; first data row is 2. */
  row: number;
  /** Logical column key (matches the Excel header). */
  column: string;
  /** Spanish label shown to the user. */
  columnLabel: string;
  /** Received value (trimmed, normalized to text). null when empty. */
  value: string | null;
  severity: IssueSeverity;
  /** Stable, machine-readable error code. */
  code: string;
  /** Clear Spanish message. */
  message: string;
  /** For duplicate/conflict issues: the first related Excel row. */
  relatedRow?: number;
}

/** Stable error codes. */
export const CODE = {
  MISSING_REQUIRED_VALUE: 'MISSING_REQUIRED_VALUE',
  MISSING_REQUIRED_HEADER: 'MISSING_REQUIRED_HEADER',
  INVALID_EMAIL: 'INVALID_EMAIL',
  VALUE_TOO_LONG: 'VALUE_TOO_LONG',
  INVALID_PHONE_FORMAT: 'INVALID_PHONE_FORMAT',
  PHONE_LENGTH_OUT_OF_RANGE: 'PHONE_LENGTH_OUT_OF_RANGE',
  INVALID_DOCUMENT_FORMAT: 'INVALID_DOCUMENT_FORMAT',
  DOCUMENT_LENGTH_OUT_OF_RANGE: 'DOCUMENT_LENGTH_OUT_OF_RANGE',
  INVALID_BENEFICIARY_AGE: 'INVALID_BENEFICIARY_AGE',
  INVALID_BENEFICIARY_GENDER: 'INVALID_BENEFICIARY_GENDER',
  CAMPAIGN_NOT_FOUND: 'CAMPAIGN_NOT_FOUND',
  CAMPAIGN_STATUS_NOT_OPEN: 'CAMPAIGN_STATUS_NOT_OPEN',
  DUPLICATE_BENEFICIARY_IN_FILE: 'DUPLICATE_BENEFICIARY_IN_FILE',
  CONFLICTING_EMPLOYEE_DATA: 'CONFLICTING_EMPLOYEE_DATA',
} as const;

/** Expected Excel headers, in canonical order. */
export const EXPECTED_HEADERS = [
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
] as const;

/** Spanish labels per logical column. */
export const COLUMN_LABELS: Record<string, string> = {
  campaignSlug: 'Campaña (slug)',
  employeeDocumentId: 'Documento',
  employeeFullName: 'Nombre del empleado',
  employeeEmail: 'Correo',
  employeePhone: 'Teléfono',
  shippingAddress: 'Dirección de entrega',
  shippingCity: 'Ciudad',
  beneficiaryFullName: 'Beneficiario',
  beneficiaryAge: 'Edad del beneficiario',
  beneficiaryGender: 'Género del beneficiario',
};

// ── Schema VarChar technical limits (safety; not the only rule) ──────────
export const MAX_CAMPAIGN_SLUG_LEN = 200; // Campaign.slug VarChar(200)
export const MAX_EMPLOYEE_NAME_LEN = 180; // Employee.fullName VarChar(180)
export const MAX_EMAIL_LEN = 180; // Employee.email VarChar(180)
export const MAX_PHONE_LEN = 30; // Employee.phone VarChar(30) — the only approved phone length rule
export const MAX_DOCUMENT_LEN = 50; // Employee.documentId VarChar(50)
export const MAX_ADDRESS_LEN = 255; // Employee.shippingAddress VarChar(255)
export const MAX_CITY_LEN = 100; // Employee.shippingCity VarChar(100)
export const MAX_BENEFICIARY_NAME_LEN = 180; // Beneficiary.fullName VarChar(180)

// ── Approved business rules ──────────────────────────────────────────────
export const MIN_DOCUMENT_DIGITS = 6; // employee document: 6-10 digits
export const MAX_DOCUMENT_DIGITS = 10;
export const MIN_BENEFICIARY_AGE = 0;
export const MAX_BENEFICIARY_AGE = 13;

// ── Phone audit result (documented, not invented) ───────────────────────
//
// Audit finding: the project has NO approved phone digit-count rule.
//   - create-employee.dto.ts only applies @MaxLength(30) + @IsString
//   - employees.service.ts only trims the value (phone = dto.phone?.trim())
//   - no validator.minDigits/maxDigits anywhere in backend or frontend
//
// Per the approved instruction, we do NOT invent a digit-count rule.
// The phone length validation therefore enforces the ONLY approved length rule
// (30-character stored limit), while the character-set check is the primary
// phone validation. PHONE_LENGTH_OUT_OF_RANGE messages reflect this real
// approved limit, never an invented digit range.
export const PHONE_AUDIT_NO_DIGIT_RULE = true;

// ── Regexes (practical, not full RFC) ────────────────────────────────────
// Email: local@domain.tld — no internal whitespace, non-empty local & domain,
// a dot in the domain, and a reasonable suffix (>= 2 chars). Rejects `david@`.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Phone: allow digits, spaces, +, hyphens, parentheses. Rejects letters/etc.
const PHONE_ALLOWED_RE = /^[0-9+\-()\s]+$/;

// ── Helpers ──────────────────────────────────────────────────────────────

function toStringOrNull(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function makeIssue(
  row: number,
  column: string,
  value: string | null,
  severity: IssueSeverity,
  code: string,
  message: string,
  relatedRow?: number,
): ImportIssue {
  return {
    row,
    column,
    columnLabel: COLUMN_LABELS[column] ?? column,
    value,
    severity,
    code,
    message,
    ...(relatedRow !== undefined ? { relatedRow } : {}),
  };
}

/** Normalize a name: trim, lowercase, collapse internal whitespace. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Normalize a campaign slug: trim + lowercase. */
export function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/** Normalize gender (male/male/masculino/m → 'male'; female/femenino/f → 'female'). */
export function normalizeGender(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (v === 'male' || v === 'masculino' || v === 'm') return 'male';
  if (v === 'female' || v === 'femenino' || v === 'f') return 'female';
  return null;
}

/** Derive a digits-only value from a phone string (for future length checks). */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

// ── Field-level validators (return ImportIssue | null) ──────────────────

export function checkRequired(
  row: number,
  column: string,
  rawValue: unknown,
  message: string,
): ImportIssue | null {
  const text = toStringOrNull(rawValue).trim();
  if (text === '') {
    return makeIssue(row, column, null, ERROR, CODE.MISSING_REQUIRED_VALUE, message);
  }
  return null;
}

export function checkMaxLength(
  row: number,
  column: string,
  rawValue: unknown,
  max: number,
  message: string,
): ImportIssue | null {
  const text = toStringOrNull(rawValue).trim();
  if (text === '') return null;
  if (text.length > max) {
    return makeIssue(row, column, text, ERROR, CODE.VALUE_TOO_LONG, message);
  }
  return null;
}

/**
 * Validate an employee document: digits only, 6-10 digits, leading zeroes
 * preserved (text). Returns up to two issues (format, length) but never both:
 * if the format is invalid the length check is skipped because length on a
 * non-digit string is meaningless.
 */
export function checkDocument(
  row: number,
  column: keyof typeof COLUMN_LABELS | string,
  rawValue: unknown,
): ImportIssue[] {
  const text = toStringOrNull(rawValue).trim();
  if (text === '') return []; // handled by required check
  const issues: ImportIssue[] = [];
  if (!/^\d+$/.test(text)) {
    issues.push(
      makeIssue(
        row,
        column,
        text,
        ERROR,
        CODE.INVALID_DOCUMENT_FORMAT,
        'El documento del empleado debe contener únicamente números.',
      ),
    );
    return issues;
  }
  if (text.length < MIN_DOCUMENT_DIGITS || text.length > MAX_DOCUMENT_DIGITS) {
    issues.push(
      makeIssue(
        row,
        column,
        text,
        ERROR,
        CODE.DOCUMENT_LENGTH_OUT_OF_RANGE,
        `El documento del empleado debe contener entre ${MIN_DOCUMENT_DIGITS} y ${MAX_DOCUMENT_DIGITS} dígitos.`,
      ),
    );
  }
  return issues;
}

/**
 * Validate an email. Strict but practical. `required` controls the empty
 * behavior: when required and empty → MISSING_REQUIRED_VALUE; when optional
 * and empty → no error. Preserves the audit finding that email is OPTIONAL in
 * the import (create-employee.dto.ts uses @IsOptional).
 */
export function checkEmail(
  row: number,
  column: keyof typeof COLUMN_LABELS | string,
  rawValue: unknown,
  required: boolean,
): ImportIssue[] {
  const text = toStringOrNull(rawValue).trim();
  if (text === '') {
    if (required) {
      return [
        makeIssue(
          row,
          column,
          null,
          ERROR,
          CODE.MISSING_REQUIRED_VALUE,
          'El correo es obligatorio.',
        ),
      ];
    }
    return []; // optional + empty: no error
  }
  const normalized = text.toLowerCase();
  const issues: ImportIssue[] = [];
  if (normalized.length > MAX_EMAIL_LEN) {
    issues.push(
      makeIssue(
        row,
        column,
        normalized,
        ERROR,
        CODE.VALUE_TOO_LONG,
        `El correo no puede superar los ${MAX_EMAIL_LEN} caracteres.`,
      ),
    );
    return issues; // length failure short-circuits format
  }
  if (!EMAIL_RE.test(normalized)) {
    issues.push(
      makeIssue(row, column, normalized, ERROR, CODE.INVALID_EMAIL, 'El correo no tiene un formato válido.'),
    );
  }
  return issues;
}

/**
 * Validate a phone. Moderate, accepts formatted/international values.
 * `required` controls empty behavior. When optional and empty → no error.
 *
 * Rules (in order): allowed characters (digits, spaces, +, -, parentheses);
 * stored length <= 30. No invented digit-count rule (see PHONE_AUDIT above).
 */
export function checkPhone(
  row: number,
  column: keyof typeof COLUMN_LABELS | string,
  rawValue: unknown,
  required: boolean,
): ImportIssue[] {
  const text = toStringOrNull(rawValue).trim();
  if (text === '') {
    if (required) {
      return [
        makeIssue(
          row,
          column,
          null,
          ERROR,
          CODE.MISSING_REQUIRED_VALUE,
          'El teléfono es obligatorio.',
        ),
      ];
    }
    return []; // optional + empty: no error
  }
  const issues: ImportIssue[] = [];
  if (!PHONE_ALLOWED_RE.test(text)) {
    issues.push(
      makeIssue(
        row,
        column,
        text,
        ERROR,
        CODE.INVALID_PHONE_FORMAT,
        'El teléfono contiene caracteres no permitidos.',
      ),
    );
    return issues; // unparseable characters → stop length checks
  }
  if (text.length > MAX_PHONE_LEN) {
    issues.push(
      makeIssue(
        row,
        column,
        text,
        ERROR,
        CODE.PHONE_LENGTH_OUT_OF_RANGE,
        `El teléfono no puede superar los ${MAX_PHONE_LEN} caracteres.`,
      ),
    );
  }
  return issues;
}

/** Validate beneficiary age: required, integer in [0,13]. */
export function checkBeneficiaryAge(
  row: number,
  column: keyof typeof COLUMN_LABELS | string,
  rawValue: unknown,
): ImportIssue[] {
  const text = toStringOrNull(rawValue).trim();
  if (text === '') {
    return [
      makeIssue(
        row,
        column,
        null,
        ERROR,
        CODE.MISSING_REQUIRED_VALUE,
        'La edad del beneficiario es obligatoria.',
      ),
    ];
  }
  const num = Number(text);
  if (!Number.isInteger(num) || num < MIN_BENEFICIARY_AGE || num > MAX_BENEFICIARY_AGE) {
    return [
      makeIssue(
        row,
        column,
        text,
        ERROR,
        CODE.INVALID_BENEFICIARY_AGE,
        `La edad del beneficiario debe ser un número entero entre ${MIN_BENEFICIARY_AGE} y ${MAX_BENEFICIARY_AGE}.`,
      ),
    ];
  }
  return [];
}

/** Validate beneficiary gender: required, male/female (or masculino/femenino/m/f). */
export function checkBeneficiaryGender(
  row: number,
  column: keyof typeof COLUMN_LABELS | string,
  rawValue: unknown,
): ImportIssue[] {
  const text = toStringOrNull(rawValue).trim();
  if (text === '') {
    return [
      makeIssue(
        row,
        column,
        null,
        ERROR,
        CODE.MISSING_REQUIRED_VALUE,
        'El género del beneficiario es obligatorio.',
      ),
    ];
  }
  if (!normalizeGender(text)) {
    return [
      makeIssue(
        row,
        column,
        text,
        ERROR,
        CODE.INVALID_BENEFICIARY_GENDER,
        'El género del beneficiario debe ser male/female (o masculino/femenino).',
      ),
    ];
  }
  return [];
}

// ── Header validation ────────────────────────────────────────────────────

/** Validate that every required header is present. Returns issues (row=1). */
export function validateHeaders(
  fileHeaders: string[],
): ImportIssue[] {
  const trimmed = fileHeaders.map((h) => (h ?? '').toString().trim());
  const issues: ImportIssue[] = [];
  for (const expected of EXPECTED_HEADERS) {
    if (!trimmed.includes(expected)) {
      issues.push(
        makeIssue(
          1,
          expected,
          null,
          ERROR,
          CODE.MISSING_REQUIRED_HEADER,
          `Falta la columna obligatoria "${expected}".`,
        ),
      );
    }
  }
  return issues;
}

// ── Normalized row + cross-row detection ─────────────────────────────────

export interface NormalizedRow {
  excelRow: number;
  rawIndex: number;
  campaignSlug: string;
  employeeDocumentId: string;
  employeeFullName: string;
  employeeEmail: string | null;
  employeePhone: string | null;
  shippingAddress: string | null;
  shippingCity: string | null;
  beneficiaryFullName: string;
  beneficiaryAge: number | null;
  beneficiaryGender: string | null;
  /** lower(slug)::documentId — complete when both slug & doc are non-empty. */
  employeeKey: string | null;
  /**
   * employeeKey::normalizedName::age::gender — complete only when employee
   * key, beneficiary full name, age and gender are all present & validated.
   */
  beneficiaryKey: string | null;
  /** Original (normalized) employee identity tuple for conflict comparison. */
  employeeInfoTuple: string | null;
}

/** Build an employee identity key from a non-empty slug + document. */
export function buildEmployeeKey(slug: string, documentId: string): string | null {
  const s = normalizeSlug(slug);
  const d = documentId.trim();
  if (!s || !d) return null;
  return `${s}::${d}`;
}

/** Build a beneficiary duplicate key, or null when the row is incomplete. */
export function buildBeneficiaryKey(
  employeeKey: string | null,
  beneficiaryFullName: string,
  age: number | null,
  gender: string | null,
): string | null {
  if (!employeeKey) return null;
  const name = normalizeName(beneficiaryFullName);
  if (!name) return null;
  if (age === null || !Number.isInteger(age)) return null;
  if (!gender) return null;
  return `${employeeKey}::${name}::${String(age)}::${gender}`;
}

/** Build a tuple of the normalized employee fields for conflict comparison. */
export function buildEmployeeInfoTuple(
  fullName: string,
  email: string | null,
  phone: string | null,
  address: string | null,
  city: string | null,
): string {
  const f = fullName.trim();
  const e = (email ?? '').trim().toLowerCase();
  const p = (phone ?? '').trim();
  const a = (address ?? '').trim();
  const c = (city ?? '').trim();
  return JSON.stringify([f, e, p, a, c]);
}

/**
 * Detect cross-row issues: exact duplicate beneficiaries inside the file, and
 * conflicting employee data for the same employee identity. Only rows with a
 * complete employee key participate (incomplete rows already emit required
 * errors at row level). Only rows with a complete beneficiary key participate
 * in duplicate detection.
 *
 * Returns one ERROR per duplicate occurrence (referencing the first occurrence)
 * and one ERROR per conflicting employee field (referencing the first row where
 * the employee identity was seen).
 */
export function detectCrossRowIssues(rows: NormalizedRow[]): ImportIssue[] {
  const issues: ImportIssue[] = [];

  // Duplicate beneficiary detection: the first occurrence with a given key is
  // the canonical row (no error for it). Later occurrences are flagged with
  // relatedRow = the first occurrence's Excel row.
  const firstBenRowsByKey = new Map<string, number>();
  for (const row of rows) {
    if (!row.beneficiaryKey) continue;
    const key = row.beneficiaryKey;
    const first = firstBenRowsByKey.get(key);
    if (first === undefined) {
      firstBenRowsByKey.set(key, row.excelRow);
      continue;
    }
    issues.push(
      makeIssue(
        row.excelRow,
        'beneficiaryFullName',
        row.beneficiaryFullName,
        ERROR,
        CODE.DUPLICATE_BENEFICIARY_IN_FILE,
        `Este beneficiario está repetido para el mismo empleado en las filas ${first} y ${row.excelRow}.`,
        first,
      ),
    );
  }

  // Conflicting employee data detection (same employee identity, different
  // employee info across rows). Compare each subsequent occurrence against the
  // FIRST occurrence's tuple; emit one error per differing field.
  const firstRowByKey = new Map<string, NormalizedRow>();
  for (const row of rows) {
    if (!row.employeeKey) continue;
    const firstRow = firstRowByKey.get(row.employeeKey);
    if (!firstRow) {
      firstRowByKey.set(row.employeeKey, row);
      continue;
    }
    // Compare fields; only emit when the first row also provided data.
    const differing = compareEmployeeFields(firstRow, row);
    for (const d of differing) {
      issues.push(
        makeIssue(
          row.excelRow,
          d.column,
          d.value,
          ERROR,
          CODE.CONFLICTING_EMPLOYEE_DATA,
          `El empleado ya aparece en la fila ${firstRow.excelRow} con información diferente (${d.label}).`,
          firstRow.excelRow,
        ),
      );
    }
  }

  return issues;
}

interface FieldDiff {
  column: string;
  label: string;
  value: string | null;
}

function compareEmployeeFields(first: NormalizedRow, current: NormalizedRow): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const cmp: Array<{
    column: string;
    label: string;
    a: string;
    b: string;
  }> = [
    {
      column: 'employeeFullName',
      label: 'nombre del empleado',
      a: (first.employeeFullName ?? '').trim(),
      b: (current.employeeFullName ?? '').trim(),
    },
    {
      column: 'employeeEmail',
      label: 'correo',
      a: (first.employeeEmail ?? '').trim().toLowerCase(),
      b: (current.employeeEmail ?? '').trim().toLowerCase(),
    },
    {
      column: 'employeePhone',
      label: 'teléfono',
      a: (first.employeePhone ?? '').trim(),
      b: (current.employeePhone ?? '').trim(),
    },
    {
      column: 'shippingAddress',
      label: 'dirección de entrega',
      a: (first.shippingAddress ?? '').trim(),
      b: (current.shippingAddress ?? '').trim(),
    },
    {
      column: 'shippingCity',
      label: 'ciudad',
      a: (first.shippingCity ?? '').trim(),
      b: (current.shippingCity ?? '').trim(),
    },
  ];
  for (const c of cmp) {
    if (c.a !== c.b) {
      diffs.push({
        column: c.column,
        label: c.label,
        value: current[c.column as keyof NormalizedRow] == null ? null : String(current[c.column as keyof NormalizedRow]),
      });
    }
  }
  return diffs;
}

/** True when the issue list contains at least one ERROR. */
export function hasBlockingErrors(issues: ImportIssue[]): boolean {
  return issues.some((i) => i.severity === ERROR);
}
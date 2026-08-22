/**
 * Pure validation layer for the bulk gift import (Excel + ZIP).
 *
 * Design goals (mirrors the employee import hardening):
 *  - Validate the COMPLETE package before any database write or storage upload.
 *  - Collect every issue (never stop on the first error) with: visible Excel
 *    row, logical column, received value, severity, stable code, Spanish text.
 *  - Atomic rule: if there is at least one ERROR-severity issue, the import is
 *    rejected (`canImport=false`) and ZERO writes / ZERO uploads may happen.
 *
 * Every function here is pure (no I/O, no DB, no ExcelJS, no JSZip) so the full
 * validation contract is covered by fast unit tests.
 */

import {
  CODE as EMPLOYEE_CODE,
  ERROR,
  WARNING,
  ImportIssue,
  IssueSeverity,
} from '../imports/import-validation';

// Severity constants shared with the rest of the import tooling.
export { ERROR, WARNING };
export type { ImportIssue, IssueSeverity };

// ── Conservative first-version limits (approved) ──────────────────────────
export const LIMITS = {
  EXCEL_MAX_BYTES: 5 * 1024 * 1024, // 5 MB
  ZIP_MAX_BYTES: 50 * 1024 * 1024, // 50 MB
  MAX_GIFTS: 50,
  MAX_IMAGES: 150,
  MAX_IMAGES_PER_GIFT: 3,
  MAX_IMAGE_BYTES: 2 * 1024 * 1024, // 2 MB per image
  MAX_TOTAL_UNCOMPRESSED_BYTES: 200 * 1024 * 1024, // 200 MB
  MAX_ZIP_ENTRIES: 300,
  UPLOAD_CONCURRENCY: 3,
  ZIP_ENTRY_MAX_UNCOMPRESSED_BYTES: 10 * 1024 * 1024,
  ZIP_SUSPICIOUS_RATIO: 100,
} as const;

// ── Excel header contract (canonical Spanish headers → internal keys) ─────
export const GIFT_HEADER_MAP: Record<string, string> = {
  CarpetaImagenes: 'imageFolder',
  Imagenes: 'imageFolder', // legacy approved alias
  Campaña: 'campaignSlug',
  Nombre: 'name',
  Referencia: 'reference',
  DescripciónCorta: 'shortDescription',
  DescripciónTécnica: 'technicalDescription',
  Medidas: 'dimensions',
  Cantidad: 'stock',
  EdadMinima: 'minAge',
  EdadMaxima: 'maxAge',
  Género: 'allowedGender',
  Estado: 'status',
};

/** Canonical (non-alias) header used when building the downloadable template. */
export const GIFT_TEMPLATE_HEADERS = [
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
] as const;

/** Internal keys that MUST be present in the Excel. */
export const GIFT_REQUIRED_HEADERS = [
  'imageFolder',
  'campaignSlug',
  'name',
  'reference',
  'stock',
  'minAge',
  'maxAge',
  'allowedGender',
] as const;

/** Spanish labels per internal column (used in report UI). */
export const GIFT_COLUMN_LABELS: Record<string, string> = {
  imageFolder: 'Carpeta de imágenes',
  campaignSlug: 'Campaña (slug)',
  name: 'Nombre',
  reference: 'Referencia',
  shortDescription: 'Descripción corta',
  technicalDescription: 'Descripción técnica',
  dimensions: 'Medidas',
  stock: 'Cantidad',
  minAge: 'Edad mínima',
  maxAge: 'Edad máxima',
  allowedGender: 'Género',
  status: 'Estado',
};

/** Stable gift-import error codes. */
export const GIFT_CODE = {
  // Shared (values stable across the employee importer).
  MISSING_REQUIRED_VALUE: EMPLOYEE_CODE.MISSING_REQUIRED_VALUE,
  MISSING_REQUIRED_HEADER: EMPLOYEE_CODE.MISSING_REQUIRED_HEADER,
  VALUE_TOO_LONG: EMPLOYEE_CODE.VALUE_TOO_LONG,
  CAMPAIGN_NOT_FOUND: EMPLOYEE_CODE.CAMPAIGN_NOT_FOUND,
  CAMPAIGN_STATUS_NOT_OPEN: EMPLOYEE_CODE.CAMPAIGN_STATUS_NOT_OPEN,

  // Excel structure.
  DUPLICATE_HEADER: 'DUPLICATE_HEADER',

  // Row-level excel fields.
  INVALID_STOCK: 'INVALID_STOCK',
  INVALID_MIN_AGE: 'INVALID_MIN_AGE',
  INVALID_MAX_AGE: 'INVALID_MAX_AGE',
  MIN_AGE_GREATER_THAN_MAX: 'MIN_AGE_GREATER_THAN_MAX',
  INVALID_ALLOWED_GENDER: 'INVALID_ALLOWED_GENDER',
  INVALID_GIFT_STATUS: 'INVALID_GIFT_STATUS',
  DUPLICATE_REFERENCE_IN_FILE: 'DUPLICATE_REFERENCE_IN_FILE',
  REFERENCE_ALREADY_EXISTS: 'REFERENCE_ALREADY_EXISTS',

  // Package limits.
  GIFT_LIMIT_EXCEEDED: 'GIFT_LIMIT_EXCEEDED',
  IMAGE_LIMIT_EXCEEDED: 'IMAGE_LIMIT_EXCEEDED',

  // ZIP package-level security.
  ZIP_INVALID: 'ZIP_INVALID',
  ZIP_TOO_LARGE: 'ZIP_TOO_LARGE',
  ZIP_TOO_MANY_ENTRIES: 'ZIP_TOO_MANY_ENTRIES',
  ZIP_UNCOMPRESSED_TOO_LARGE: 'ZIP_UNCOMPRESSED_TOO_LARGE',
  ZIP_ENTRY_TOO_LARGE: 'ZIP_ENTRY_TOO_LARGE',
  ZIP_SUSPICIOUS_RATIO: 'ZIP_SUSPICIOUS_RATIO',
  ZIP_PATH_TRAVERSAL: 'ZIP_PATH_TRAVERSAL',
  ZIP_ENCRYPTED_ENTRY: 'ZIP_ENCRYPTED_ENTRY',
  DUPLICATE_IMAGE_FOLDER_CASE_INSENSITIVE:
    'DUPLICATE_IMAGE_FOLDER_CASE_INSENSITIVE',
  ZIP_ROOT_FILES_IGNORED: 'ZIP_ROOT_FILES_IGNORED', // warning
  ZIP_UNREFERENCED_FOLDER: 'ZIP_UNREFERENCED_FOLDER', // warning

  // Image folder / image files.
  IMAGE_FOLDER_NOT_FOUND: 'IMAGE_FOLDER_NOT_FOUND',
  IMAGE_FOLDER_EMPTY: 'IMAGE_FOLDER_EMPTY', // warning
  TOO_MANY_IMAGES_IN_FOLDER: 'TOO_MANY_IMAGES_IN_FOLDER',
  IMAGE_TOO_LARGE_IN_ZIP: 'IMAGE_TOO_LARGE_IN_ZIP',
  IMAGE_DECODE_FAILED: 'IMAGE_DECODE_FAILED',
  UNSUPPORTED_FILE_IN_IMAGE_FOLDER: 'UNSUPPORTED_FILE_IN_IMAGE_FOLDER',
  NESTED_FOLDER_IN_IMAGE_FOLDER: 'NESTED_FOLDER_IN_IMAGE_FOLDER',
  OS_METADATA_IGNORED: 'OS_METADATA_IGNORED', // warning
} as const;

export type GiftIssue = ImportIssue;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Read a cell as plain text preserving numbers without exponential notation. */
export function numberToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
    return String(value);
  }
  return String(value);
}

/** Normalize a folder code for matching: trim + lowercase, digits preserved. */
export function normalizeFolderKey(code: string): string {
  return code.trim().toLowerCase();
}

/** Normalize a campaign slug: trim + lowercase. */
export function normalizeCampaignSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/**
 * Normalize the gift reference exactly like the manual gift create:
 * trim + uppercase. Leading zeroes remain significant because they are text
 * (`0010` stays `0010`, never coerced to the number 10).
 */
export function normalizeReference(ref: string): string {
  return ref.trim().toUpperCase();
}

const GENDER_ALIASES: Record<string, string> = {
  all: 'all',
  todos: 'all',
  male: 'male',
  masculino: 'male',
  female: 'female',
  femenino: 'female',
};

/** Normalize allowedGender. Valid: all/male/female (+ Spanish aliases). */
export function normalizeGiftGender(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return GENDER_ALIASES[v] ?? null;
}

const STATUS_ALIASES: Record<string, string> = {
  active: 'ACTIVE',
  activo: 'ACTIVE',
  inactive: 'INACTIVE',
  inactivo: 'INACTIVE',
};

/** Normalize gift status. Valid: ACTIVE/INACTIVE (+ Spanish aliases). */
export function normalizeGiftStatus(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return STATUS_ALIASES[v] ?? null;
}

/** Best-effort magic-byte sniff to validate image content and derive mime. */
export function sniffImageType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  // JPEG: FFD8FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  // WebP: RIFF....WEBP
  if (
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export function imageMimeToExtension(mime: string): string {
  return IMAGE_MIME_TO_EXT[mime] ?? '.jpg';
}

// ── Issue builders ─────────────────────────────────────────────────────────

function makeGiftIssue(
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
    columnLabel: GIFT_COLUMN_LABELS[column] ?? column,
    value,
    severity,
    code,
    message,
    ...(relatedRow !== undefined ? { relatedRow } : {}),
  };
}

function toStringOrNull(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

// ── Header validation ──────────────────────────────────────────────────────

export interface HeaderParseResult {
  issues: ImportIssue[];
  /** Maps internal column key → excel column index (1-based). */
  columnIndex: Map<string, number>;
  /** Raw trimmed Spanish headers found in row 1, in file order. */
  rawHeaders: string[];
}

/**
 * Validate the header row (row 1). Returns issues for duplicate `Imagenes` +
 * `CarpetaImagenes` and for every missing required header, plus a column
 * index map to read rows.
 */
export function parseGiftHeaders(rawHeaders: string[]): HeaderParseResult {
  const issues: ImportIssue[] = [];
  const trimmed = rawHeaders.map((h) => (h ?? '').toString().trim());
  const columnIndex = new Map<string, number>();
  const seenInternal = new Map<string, number>();

  for (let i = 0; i < trimmed.length; i++) {
    const raw = trimmed[i];
    if (!raw) continue;
    const internal = GIFT_HEADER_MAP[raw];
    if (!internal) {
      // Unknown column: ignore (not required, not mapped). No error.
      continue;
    }
    const firstIdx = seenInternal.get(internal);
    if (firstIdx !== undefined) {
      // Duplicate internal mapping: CarpetaImagenes + Imagenes.
      issues.push(
        makeGiftIssue(
          1,
          internal,
          raw,
          ERROR,
          GIFT_CODE.DUPLICATE_HEADER,
          `La columna "${raw}" duplica la columna "${trimmed[firstIdx]}" (ambas mapean a ${GIFT_COLUMN_LABELS[internal] ?? internal}). Usa solo una.`,
        ),
      );
      continue;
    }
    seenInternal.set(internal, i);
    columnIndex.set(internal, i); // 0-based; translate +1 when reading cells
  }

  for (const required of GIFT_REQUIRED_HEADERS) {
    if (!columnIndex.has(required)) {
      issues.push(
        makeGiftIssue(
          1,
          required,
          null,
          ERROR,
          GIFT_CODE.MISSING_REQUIRED_HEADER,
          `Falta la columna obligatoria "${GIFT_TEMPLATE_HEADERS.find((h) => GIFT_HEADER_MAP[h] === required) ?? required}".`,
        ),
      );
    }
  }

  return { issues, columnIndex, rawHeaders: trimmed };
}

// ── Row-level field validators ─────────────────────────────────────────────

/** Stock: required, integer, >= 0, within Int range. Returns issues. */
export function checkGiftStock(
  row: number,
  rawValue: unknown,
): ImportIssue[] {
  const text = numberToText(rawValue).trim();
  if (text === '') {
    return [
      makeGiftIssue(
        row,
        'stock',
        null,
        ERROR,
        GIFT_CODE.MISSING_REQUIRED_VALUE,
        'La cantidad (stock) es obligatoria.',
      ),
    ];
  }
  const num = Number(text);
  if (!Number.isInteger(num) || num < 0 || num > 2147483647) {
    return [
      makeGiftIssue(
        row,
        'stock',
        text,
        ERROR,
        GIFT_CODE.INVALID_STOCK,
        'La cantidad (stock) debe ser un número entero mayor o igual a 0.',
      ),
    ];
  }
  return [];
}

/** Age bound (minAge/maxAge): required, integer in [0,13]. */
export function checkGiftAge(
  row: number,
  column: 'minAge' | 'maxAge',
  rawValue: unknown,
): ImportIssue[] {
  const text = numberToText(rawValue).trim();
  const code = column === 'minAge' ? GIFT_CODE.INVALID_MIN_AGE : GIFT_CODE.INVALID_MAX_AGE;
  if (text === '') {
    return [
      makeGiftIssue(
        row,
        column,
        null,
        ERROR,
        GIFT_CODE.MISSING_REQUIRED_VALUE,
        `${GIFT_COLUMN_LABELS[column]} es obligatoria.`,
      ),
    ];
  }
  const num = Number(text);
  if (!Number.isInteger(num) || num < 0 || num > 13) {
    return [
      makeGiftIssue(
        row,
        column,
        text,
        ERROR,
        code,
        `${GIFT_COLUMN_LABELS[column]} debe ser un número entero entre 0 y 13.`,
      ),
    ];
  }
  return [];
}

/** minAge <= maxAge. */
export function checkAgeRange(
  row: number,
  minAge: number | null,
  maxAge: number | null,
): ImportIssue[] {
  if (minAge === null || maxAge === null) return [];
  if (minAge > maxAge) {
    return [
      makeGiftIssue(
        row,
        'minAge',
        String(minAge),
        ERROR,
        GIFT_CODE.MIN_AGE_GREATER_THAN_MAX,
        `La edad mínima (${minAge}) no puede ser mayor que la edad máxima (${maxAge}).`,
      ),
    ];
  }
  return [];
}

/** allowedGender: required + valid (with Spanish aliases). */
export function checkGiftGender(
  row: number,
  rawValue: unknown,
): ImportIssue[] {
  const text = toStringOrNull(rawValue).trim();
  if (text === '') {
    return [
      makeGiftIssue(
        row,
        'allowedGender',
        null,
        ERROR,
        GIFT_CODE.MISSING_REQUIRED_VALUE,
        'El género es obligatorio.',
      ),
    ];
  }
  if (!normalizeGiftGender(text)) {
    return [
      makeGiftIssue(
        row,
        'allowedGender',
        text,
        ERROR,
        GIFT_CODE.INVALID_ALLOWED_GENDER,
        'El género debe ser all/todos, male/masculino o female/femenino.',
      ),
    ];
  }
  return [];
}

/** Status: empty → null (defaults ACTIVE); invalid → issue. */
export function checkGiftStatus(
  row: number,
  rawValue: unknown,
): ImportIssue[] {
  const text = toStringOrNull(rawValue).trim();
  if (text === '') return [];
  if (!normalizeGiftStatus(text)) {
    return [
      makeGiftIssue(
        row,
        'status',
        text,
        ERROR,
        GIFT_CODE.INVALID_GIFT_STATUS,
        'El estado debe ser ACTIVE/Activo o INACTIVE/Inactivo.',
      ),
    ];
  }
  return [];
}

/** Generic required check with Spanish message. */
export function checkRequired(
  row: number,
  column: string,
  rawValue: unknown,
  message: string,
): ImportIssue | null {
  if (toStringOrNull(rawValue).trim() === '') {
    return makeGiftIssue(row, column, null, ERROR, GIFT_CODE.MISSING_REQUIRED_VALUE, message);
  }
  return null;
}

/** Generic max-length check. */
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
    return makeGiftIssue(row, column, text, ERROR, GIFT_CODE.VALUE_TOO_LONG, message);
  }
  return null;
}

// ── Normalized row + cross-row detection ───────────────────────────────────

export interface GiftImportRow {
  excelRow: number;
  rawIndex: number;
  imageFolder: string;
  campaignSlug: string;
  name: string;
  reference: string;
  referenceNorm: string; // trim + uppercase
  shortDescription: string | null;
  technicalDescription: string | null;
  dimensions: string | null;
  stock: number;
  minAge: number;
  maxAge: number;
  allowedGender: 'all' | 'male' | 'female';
  status: 'ACTIVE' | 'INACTIVE';
  /** lower(trim(imageFolder)) for matching; digits preserved. */
  folderKey: string | null;
  /** lower(slug)::referenceNorm for cross-row / DB checks. */
  campaignReferenceKey: string | null;
}

/**
 * Detect duplicate (campaign, reference) pairs inside the file. The first
 * occurrence is canonical; later occurrences get a blocking error referencing it.
 */
export function detectDuplicateReferences(
  rows: GiftImportRow[],
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const firstRowByKey = new Map<string, number>();
  for (const row of rows) {
    if (!row.campaignReferenceKey) continue;
    const first = firstRowByKey.get(row.campaignReferenceKey);
    if (first === undefined) {
      firstRowByKey.set(row.campaignReferenceKey, row.excelRow);
      continue;
    }
    issues.push(
      makeGiftIssue(
        row.excelRow,
        'reference',
        row.reference,
        ERROR,
        GIFT_CODE.DUPLICATE_REFERENCE_IN_FILE,
        `El regalo con referencia "${row.reference}" se repite para la misma campaña (filas ${first} y ${row.excelRow}).`,
        first,
      ),
    );
  }
  return issues;
}

/** True when the issue list contains at least one ERROR. */
export function hasBlockingErrors(issues: ImportIssue[]): boolean {
  return issues.some((i) => i.severity === ERROR);
}

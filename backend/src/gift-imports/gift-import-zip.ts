/**
 * Secure ZIP parsing for the bulk gift import.
 *
 * Security responsibilities (all in-memory, never written to disk):
 *  - path traversal / absolute-path / drive-letter / backslash rejection
 *  - encrypted-entry rejection
 *  - entry-count cap, total-uncompressed cap, per-entry bomb ratio
 *  - case-insensitive top-level folder ambiguity detection
 *  - metadata inventory so the service can match Excel rows to folders and
 *    only then inflate the specific referenced images (bounded by the
 *    uncompressed caps).
 *
 * JSZip metadata (`loadAsync`) does NOT inflate file contents; contents are
 * inflated lazily per entry, which lets us keep memory bounded.
 */

import * as JSZip from 'jszip';
import { ImportIssue } from '../imports/import-validation';
import { ERROR, LIMITS, GIFT_CODE, numberToText } from './gift-import-validation';

export interface ZipEntryMeta {
  /** Full entry name as stored (forward slashes). */
  name: string;
  /** File name (last path segment). */
  fileName: string;
  /** Path segments (empty segments already rejected). */
  segments: string[];
  /** First segment (display form). */
  topLevel: string;
  /** lower(first segment) — match key. */
  topLevelKey: string;
  isDir: boolean;
  /** Uncompressed size (bytes), from central-directory metadata. */
  size: number;
  compressedSize: number;
}

/**
 * JSZip does not expose `uncompressedSize`/`compressedSize` on the public
 * JSZipObject type; at runtime they live on the (non-public) `_data` object
 * populated from the central directory during `loadAsync`.
 */
interface CompressedObjectLike {
  _data?: {
    compressedSize?: number;
    uncompressedSize?: number;
    crc32?: number;
  };
}

function entrySizes(file: JSZip.JSZipObject): {
  uncompressed: number;
  compressed: number;
} {
  const d = (file as unknown as CompressedObjectLike)._data;
  return {
    uncompressed: d?.uncompressedSize ?? 0,
    compressed: d?.compressedSize ?? 0,
  };
}

export interface ZipFolderMeta {
  /** Display folder name (exact case as stored). */
  display: string;
  topLevelKey: string;
  /** File entries whose top-level segment equals this folder (not dirs). */
  files: ZipEntryMeta[];
  /** Directory entries inside this folder (any depth). */
  dirs: ZipEntryMeta[];
}

export interface ZipPackageResult {
  zip: JSZip | null;
  /** Package-level blocking issues. */
  issues: ImportIssue[];
  /** Non-blocking warnings discovered during parse. */
  warnings: ImportIssue[];
  /** Top-level folders keyed by lower(first segment). */
  folders: Map<string, ZipFolderMeta>;
  /** Files living at the ZIP root (no folder). */
  rootFiles: ZipEntryMeta[];
  entries: ZipEntryMeta[];
}

/** Reject traversal/absolute/drive/backslash path shapes. */
export function isUnsafePath(name: string): boolean {
  if (!name) return true;
  let s = name;
  // A single trailing slash is a directory marker (allowed): strip it before
  // segment analysis. Interior empty segments (e.g. "a//b") are still unsafe.
  if (s.endsWith('/')) s = s.slice(0, -1);
  const segments = s.split('/');
  if (segments.some((seg) => seg === '')) return true;
  if (segments.some((seg) => seg === '..' || seg === '.')) return true;
  if (segments[0] && /^[a-zA-Z]:/.test(segments[0])) return true; // drive letter
  if (segments.some((seg) => seg.includes('\\'))) return true; // windows separators
  return false;
}

/** Inflate a single entry to its raw bytes (used only for referenced images). */
export async function inflateEntry(
  zip: JSZip,
  entryName: string,
): Promise<Buffer> {
  const data = await zip.files[entryName].async('nodebuffer');
  return Buffer.from(data as unknown as ArrayBuffer);
}

/** OS metadata files that may be ignored (with warning) in referenced folders. */
export function isOsMetadataFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower === '.ds_store') return true;
  if (lower === 'thumbs.db') return true;
  if (lower === '__macosx') return true;
  if (lower.startsWith('._')) return true; // AppleDouble resource forks
  return false;
}

function makeParseIssue(
  row: number,
  column: string,
  value: string | null,
  severity: 'ERROR' | 'WARNING',
  code: string,
  message: string,
): ImportIssue {
  return {
    row,
    column,
    columnLabel: 'ZIP',
    value,
    severity,
    code,
    message,
  };
}

/**
 * Load and inventory a ZIP buffer applying all package-level security checks.
 * On any blocking package issue the returned `zip` is null and writing is
 * therefore impossible (atomic rule is checked before any write/upload).
 */
export async function loadGiftZip(
  buffer: Buffer,
): Promise<ZipPackageResult> {
  const issues: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  if (buffer.length > LIMITS.ZIP_MAX_BYTES) {
    issues.push(
      makeParseIssue(
        1,
        'zip',
        String(buffer.length),
        'ERROR',
        GIFT_CODE.ZIP_TOO_LARGE,
        `El archivo ZIP supera el tamaño máximo permitido de ${LIMITS.ZIP_MAX_BYTES / 1024 / 1024} MB.`,
      ),
    );
    return { zip: null, issues, warnings, folders: new Map(), rootFiles: [], entries: [] };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
  } catch {
    issues.push(
      makeParseIssue(
        1,
        'zip',
        null,
        'ERROR',
        GIFT_CODE.ZIP_INVALID,
        'El archivo ZIP no pudo leerse: está dañado, no es un ZIP válido o contiene entradas cifradas.',
      ),
    );
    return { zip: null, issues, warnings, folders: new Map(), rootFiles: [], entries: [] };
  }

  const allNames = Object.keys(zip.files);
  if (allNames.length > LIMITS.MAX_ZIP_ENTRIES) {
    issues.push(
      makeParseIssue(
        1,
        'zip',
        String(allNames.length),
        'ERROR',
        GIFT_CODE.ZIP_TOO_MANY_ENTRIES,
        `El archivo ZIP contiene demasiadas entradas (máximo ${LIMITS.MAX_ZIP_ENTRIES}).`,
      ),
    );
    return { zip: null, issues, warnings, folders: new Map(), rootFiles: [], entries: [] };
  }

  // Build entry metadata in a deterministic order.
  const entries: ZipEntryMeta[] = [];
  let totalUncompressed = 0;
  let unsafeDetected = false;
  let bombDetected = null as string | null;
  let entryTooLargeDetected = null as string | null;

  const sortedNames = [...allNames].sort();
  for (const name of sortedNames) {
    const file = zip.files[name];
    const { uncompressed, compressed } = entrySizes(file);
    const isDir = file.dir || name.endsWith('/');
    if (isUnsafePath(name)) {
      if (!unsafeDetected) {
        issues.push(
          makeParseIssue(
            1,
            'zip',
            name,
            'ERROR',
            GIFT_CODE.ZIP_PATH_TRAVERSAL,
            `El archivo ZIP contiene una ruta insegura: "${name}".`,
          ),
        );
        unsafeDetected = true;
      }
      continue;
    }

    // Strip the trailing empty segment produced by directory markers
    // ("folder/" -> ["folder"]) so dir entries are not treated as nested.
    let segments = name.split('/');
    if (name.endsWith('/')) segments = segments.slice(0, -1);
    const last = segments[segments.length - 1];
    // Folder classification:
    //  - root-level dir marker  (dir, 1 segment)  → topLevel = that name (folder exists)
    //  - root-level file        (file, 1 segment) → topLevel = '' (unassociated)
    //  - anything deeper        (>=2 segments)    → topLevel = first segment
    let topLevel = '';
    if (segments.length >= 2) {
      topLevel = segments[0];
    } else if (isDir) {
      topLevel = segments[0];
    }
    const meta: ZipEntryMeta = {
      name,
      fileName: last,
      segments,
      topLevel,
      topLevelKey: topLevel.trim().toLowerCase(),
      isDir,
      size: uncompressed,
      compressedSize: compressed,
    };
    entries.push(meta);

    if (isDir) {
      continue;
    }

    totalUncompressed += uncompressed;

    // Per-entry memory guard: never inflate a single entry beyond 10 MB.
    if (uncompressed > LIMITS.ZIP_ENTRY_MAX_UNCOMPRESSED_BYTES) {
      if (!entryTooLargeDetected) {
        issues.push(
          makeParseIssue(
            1,
            'zip',
            name,
            'ERROR',
            GIFT_CODE.ZIP_ENTRY_TOO_LARGE,
            `El archivo "${name}" supera el tamaño máximo sin comprimir por entrada (${LIMITS.ZIP_ENTRY_MAX_UNCOMPRESSED_BYTES / 1024 / 1024} MB).`,
          ),
        );
        entryTooLargeDetected = name;
      }
    }

    // Zip-bomb ratio guard for large entries (declared vs. compressed size).
    if (uncompressed > 10 * 1024 * 1024) {
      const ratio =
        compressed > 0 ? uncompressed / compressed : Infinity;
      if (ratio > LIMITS.ZIP_SUSPICIOUS_RATIO) {
        if (!bombDetected) {
          issues.push(
            makeParseIssue(
              1,
              'zip',
              name,
              'ERROR',
              GIFT_CODE.ZIP_SUSPICIOUS_RATIO,
              `El archivo ZIP declara una descompresión sospechosamente grande para "${name}" (posible zip bomb).`,
            ),
          );
          bombDetected = name;
        }
      }
    }
  }

  if (totalUncompressed > LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES) {
    issues.push(
      makeParseIssue(
        1,
        'zip',
        String(totalUncompressed),
        'ERROR',
        GIFT_CODE.ZIP_UNCOMPRESSED_TOO_LARGE,
        `El contenido total del ZIP excede el límite de ${LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES / 1024 / 1024} MB sin comprimir.`,
      ),
    );
  }

  // Folder inventory (display name -> entries) + case-insensitive ambiguity.
  const folders = new Map<string, ZipFolderMeta>();
  const lowerToDisplays = new Map<string, Set<string>>();
  const rootFiles: ZipEntryMeta[] = [];

  for (const entry of entries) {
    if (!entry.topLevel) {
      // Root-level file.
      if (!entry.isDir) rootFiles.push(entry);
      continue;
    }
    let folder = folders.get(entry.topLevelKey);
    if (!folder) {
      folder = { display: entry.topLevel, topLevelKey: entry.topLevelKey, files: [], dirs: [] };
      folders.set(entry.topLevelKey, folder);
    }
    // If the same folder is seen later with a different case, detect ambiguity.
    const displaySet = lowerToDisplays.get(entry.topLevelKey) ?? new Set<string>();
    displaySet.add(entry.topLevel);
    lowerToDisplays.set(entry.topLevelKey, displaySet);

    if (entry.isDir) folder.dirs.push(entry);
    else folder.files.push(entry);
  }

  for (const [key, displays] of lowerToDisplays) {
    if (displays.size > 1) {
      issues.push(
        makeParseIssue(
          1,
          'zip',
          [...displays].join(', '),
          'ERROR',
          GIFT_CODE.DUPLICATE_IMAGE_FOLDER_CASE_INSENSITIVE,
          `El ZIP contiene carpetas con el mismo nombre pero distinto uso de mayúsculas: ${[...displays].join(', ')}. Renombra una de ellas.`,
        ),
      );
    }
  }

  if (rootFiles.length > 0) {
    warnings.push(
      makeParseIssue(
        1,
        'zip',
        rootFiles.map((f) => f.name).join(', '),
        'WARNING',
        GIFT_CODE.ZIP_ROOT_FILES_IGNORED,
        `Se ignorarán ${rootFiles.length} archivo(s) ubicado(s) fuera de carpetas: ${rootFiles.map((f) => f.name).join(', ')}.`,
      ),
    );
  }

  return { zip, issues, warnings, folders, rootFiles, entries };
}

export { numberToText };

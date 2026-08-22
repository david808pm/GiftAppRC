import 'reflect-metadata';
import {
  GIFT_CODE,
  GIFT_HEADER_MAP,
  normalizeFolderKey,
  normalizeReference,
  normalizeGiftGender,
  normalizeGiftStatus,
  numberToText,
  sniffImageType,
  checkGiftStock,
  checkGiftAge,
  checkAgeRange,
  checkGiftGender,
  checkGiftStatus,
  parseGiftHeaders,
  detectDuplicateReferences,
  hasBlockingErrors,
  GiftImportRow,
} from './gift-import-validation';
import { pngBytes, jpegBytes, webpBytes, junkBytes } from './test-utils';

function fakeRow(overrides: Partial<GiftImportRow> = {}): GiftImportRow {
  return {
    excelRow: 2,
    rawIndex: 0,
    imageFolder: 'GFT-001',
    campaignSlug: 'tigo-2026',
    name: 'Regalo Uno',
    reference: 'GFT-001',
    referenceNorm: 'GFT-001',
    shortDescription: null,
    technicalDescription: null,
    dimensions: null,
    stock: 10,
    minAge: 0,
    maxAge: 13,
    allowedGender: 'all',
    status: 'ACTIVE',
    folderKey: 'gft-001',
    campaignReferenceKey: 'tigo-2026::GFT-001',
    ...overrides,
  };
}

describe('numberToText', () => {
  it('preserves leading-zero strings as text', () => {
    expect(numberToText('0010')).toBe('0010');
  });
  it('renders plain integers without exponent', () => {
    expect(numberToText(9000000001)).toBe('9000000001');
    expect(numberToText(10)).toBe('10');
  });
  it('renders empty/null as empty string', () => {
    expect(numberToText(null)).toBe('');
    expect(numberToText(undefined)).toBe('');
  });
});

describe('normalizeReference', () => {
  it('trims and uppercases', () => {
    expect(normalizeReference('  gft-001 ')).toBe('GFT-001');
  });
  it('preserves leading zeroes (text)', () => {
    expect(normalizeReference('0010')).toBe('0010');
  });
});

describe('normalizeFolderKey', () => {
  it('trims + lowercases, preserves digits', () => {
    expect(normalizeFolderKey(' 0010 ')).toBe('0010');
    expect(normalizeFolderKey('ABC')).toBe('abc');
  });
  it('keeps leading zeroes significant (0010 !== 10)', () => {
    expect(normalizeFolderKey('0010')).not.toBe(normalizeFolderKey('10'));
  });
});

describe('normalizeGiftGender / normalizeGiftStatus', () => {
  it('accepts enums and Spanish aliases', () => {
    expect(normalizeGiftGender('all')).toBe('all');
    expect(normalizeGiftGender('todos')).toBe('all');
    expect(normalizeGiftGender('Masculino')).toBe('male');
    expect(normalizeGiftGender('female')).toBe('female');
    expect(normalizeGiftGender('x')).toBeNull();
  });
  it('accepts ACTIVE/INACTIVE and Spanish aliases', () => {
    expect(normalizeGiftStatus('Activo')).toBe('ACTIVE');
    expect(normalizeGiftStatus('inactive')).toBe('INACTIVE');
    expect(normalizeGiftStatus('x')).toBeNull();
  });
});

describe('sniffImageType (magic bytes)', () => {
  it('detects png/jpeg/webp', () => {
    expect(sniffImageType(pngBytes())).toBe('image/png');
    expect(sniffImageType(jpegBytes())).toBe('image/jpeg');
    expect(sniffImageType(webpBytes())).toBe('image/webp');
  });
  it('rejects garbage and short buffers', () => {
    expect(sniffImageType(junkBytes())).toBeNull();
    expect(sniffImageType(Buffer.alloc(8, 0x89))).toBeNull();
  });
});

describe('checkGiftStock', () => {
  it('empty is a blocking required error', () => {
    const issues = checkGiftStock(2, '');
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe(GIFT_CODE.MISSING_REQUIRED_VALUE);
  });
  it('rejects non-integers, negatives and out-of-Int values', () => {
    expect(checkGiftStock(2, 'abc')[0].code).toBe(GIFT_CODE.INVALID_STOCK);
    expect(checkGiftStock(2, -1)[0].code).toBe(GIFT_CODE.INVALID_STOCK);
    expect(checkGiftStock(2, 1.5)[0].code).toBe(GIFT_CODE.INVALID_STOCK);
    expect(checkGiftStock(2, 2147483648)[0].code).toBe(GIFT_CODE.INVALID_STOCK);
  });
  it('accepts valid integer stock', () => {
    expect(checkGiftStock(2, 10)).toHaveLength(0);
    expect(checkGiftStock(2, '0')).toHaveLength(0);
  });
});

describe('checkGiftAge', () => {
  it('empty is a blocking required error', () => {
    expect(checkGiftAge(2, 'minAge', '')[0].code).toBe(
      GIFT_CODE.MISSING_REQUIRED_VALUE,
    );
  });
  it('rejects out-of-range and non-integer', () => {
    expect(checkGiftAge(2, 'minAge', 14)[0].code).toBe(GIFT_CODE.INVALID_MIN_AGE);
    expect(checkGiftAge(2, 'maxAge', 'abc')[0].code).toBe(GIFT_CODE.INVALID_MAX_AGE);
  });
  it('accepts integer 0..13', () => {
    expect(checkGiftAge(2, 'minAge', 0)).toHaveLength(0);
    expect(checkGiftAge(2, 'maxAge', 13)).toHaveLength(0);
  });
});

describe('checkAgeRange', () => {
  it('minAge > maxAge is blocking', () => {
    const issues = checkAgeRange(2, 5, 3);
    expect(issues[0].code).toBe(GIFT_CODE.MIN_AGE_GREATER_THAN_MAX);
  });
  it('valid range produces no issues', () => {
    expect(checkAgeRange(2, 0, 13)).toHaveLength(0);
  });
});

describe('checkGiftGender / checkGiftStatus', () => {
  it('missing gender is blocking; invalid gender too', () => {
    expect(checkGiftGender(2, '')[0].code).toBe(GIFT_CODE.MISSING_REQUIRED_VALUE);
    expect(checkGiftGender(2, 'robot')[0].code).toBe(GIFT_CODE.INVALID_ALLOWED_GENDER);
  });
  it('empty status is OK (defaults ACTIVE); invalid status is blocking', () => {
    expect(checkGiftStatus(2, '')).toHaveLength(0);
    expect(checkGiftStatus(2, 'x')[0].code).toBe(GIFT_CODE.INVALID_GIFT_STATUS);
  });
});

describe('parseGiftHeaders', () => {
  const canonical = Object.keys(GIFT_HEADER_MAP).filter(
    (h) => h !== 'Imagenes',
  );

  it('accepts all canonical Spanish headers', () => {
    const res = parseGiftHeaders(canonical);
    expect(res.issues).toHaveLength(0);
    for (const key of [
      'imageFolder',
      'campaignSlug',
      'name',
      'reference',
      'stock',
      'minAge',
      'maxAge',
      'allowedGender',
    ]) {
      expect(res.columnIndex.has(key)).toBe(true);
    }
  });
  it('reports each missing required header', () => {
    const headers = canonical.filter((h) => h !== 'Cantidad');
    const res = parseGiftHeaders(headers);
    expect(
      res.issues.some((i) => i.code === GIFT_CODE.MISSING_REQUIRED_HEADER),
    ).toBe(true);
    expect(res.issues.some((i) => i.code === GIFT_CODE.MISSING_REQUIRED_HEADER)).toBe(true);
  });
  it('blocks Imagenes + CarpetaImagenes duplicate mapping', () => {
    const res = parseGiftHeaders(['CarpetaImagenes', 'Imagenes', 'Campaña']);
    expect(res.issues.some((i) => i.code === GIFT_CODE.DUPLICATE_HEADER)).toBe(true);
  });
  it('accepts the legacy Imagenes alias alone', () => {
    const headers = canonical.filter((h) => h !== 'CarpetaImagenes');
    const res = parseGiftHeaders(['Imagenes', ...headers.slice(1)]);
    expect(res.issues.some((i) => i.code === GIFT_CODE.DUPLICATE_HEADER)).toBe(false);
    expect(res.columnIndex.has('imageFolder')).toBe(true);
  });
});

describe('detectDuplicateReferences', () => {
  it('flags same campaign+reference with relatedRow', () => {
    const issues = detectDuplicateReferences([
      fakeRow({ excelRow: 2 }),
      fakeRow({ excelRow: 3 }),
    ]);
    const dup = issues.find((i) => i.code === GIFT_CODE.DUPLICATE_REFERENCE_IN_FILE);
    expect(dup).toBeDefined();
    expect(dup!.row).toBe(3);
    expect(dup!.relatedRow).toBe(2);
  });
  it('allows same reference in different campaigns', () => {
    const issues = detectDuplicateReferences([
      fakeRow({ excelRow: 2, campaignReferenceKey: 'a::REF' }),
      fakeRow({ excelRow: 3, campaignReferenceKey: 'b::REF' }),
    ]);
    expect(issues).toHaveLength(0);
  });
});

describe('hasBlockingErrors', () => {
  it('detects at least one ERROR', () => {
    expect(hasBlockingErrors([])).toBe(false);
    expect(
      hasBlockingErrors([
        { row: 2, column: 'x', columnLabel: 'X', value: null, severity: 'WARNING', code: 'W', message: 'w' },
      ]),
    ).toBe(false);
    expect(
      hasBlockingErrors([
        { row: 2, column: 'x', columnLabel: 'X', value: null, severity: 'ERROR', code: 'E', message: 'e' },
      ]),
    ).toBe(true);
  });
});

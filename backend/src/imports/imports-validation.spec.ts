import {
  CODE,
  ERROR,
  ImportIssue,
  MAX_EMAIL_LEN,
  MAX_PHONE_LEN,
  MIN_DOCUMENT_DIGITS,
  MAX_DOCUMENT_DIGITS,
  NormalizedRow,
  buildBeneficiaryKey,
  buildEmployeeKey,
  checkBeneficiaryAge,
  checkBeneficiaryGender,
  checkDocument,
  checkEmail,
  checkPhone,
  detectCrossRowIssues,
  hasBlockingErrors,
  normalizeGender,
  normalizeName,
  validateHeaders,
} from './import-validation';

function issueCodes(issues: ImportIssue[]): string[] {
  return issues.map((i) => i.code);
}

function makeNormalizedRow(
  overrides: Partial<NormalizedRow> & { excelRow: number },
): NormalizedRow {
  return {
    rawIndex: overrides.excelRow - 2,
    campaignSlug: 'tigo-2026',
    employeeDocumentId: '1234567890',
    employeeFullName: 'Empleado Prueba',
    employeeEmail: null,
    employeePhone: null,
    shippingAddress: null,
    shippingCity: null,
    beneficiaryFullName: 'Ben',
    beneficiaryAge: 5,
    beneficiaryGender: 'male',
    employeeKey: buildEmployeeKey('tigo-2026', '1234567890'),
    beneficiaryKey: null,
    employeeInfoTuple: null,
    ...overrides,
  };
}

describe('Import validation — pure validators', () => {
  // ── Duplicate beneficiaries inside the file (#1, #2, #3, #4, #5) ───────

  it('#1 exact beneficiary duplicate in the same file is a blocking error', () => {
    const keyA = buildBeneficiaryKey(
      buildEmployeeKey('tigo-2026', '1234567890'),
      'Ana',
      7,
      'female',
    );
    const rows = [
      makeNormalizedRow({ excelRow: 12, beneficiaryKey: keyA, beneficiaryFullName: 'Ana' }),
      makeNormalizedRow({ excelRow: 25, beneficiaryKey: keyA, beneficiaryFullName: 'Ana' }),
    ];
    const issues = detectCrossRowIssues(rows);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe(ERROR);
    expect(issues[0].code).toBe(CODE.DUPLICATE_BENEFICIARY_IN_FILE);
    expect(issues[0].row).toBe(25);
    expect(issues[0].relatedRow).toBe(12);
    expect(issues[0].column).toBe('beneficiaryFullName');
    expect(issues[0].message).toContain('12');
    expect(issues[0].message).toContain('25');
    expect(hasBlockingErrors(issues)).toBe(true);
  });

  it('#2 duplicate detected across non-consecutive rows', () => {
    const keyA = buildBeneficiaryKey(
      buildEmployeeKey('tigo-2026', '1111111111'),
      'Lola',
      3,
      'female',
    );
    const rows = [
      makeNormalizedRow({ excelRow: 4, beneficiaryKey: keyA, beneficiaryFullName: 'Lola' }),
      makeNormalizedRow({
        excelRow: 5,
        employeeDocumentId: '2222222222',
        employeeKey: buildEmployeeKey('tigo-2026', '2222222222'),
        beneficiaryFullName: 'Otro',
        beneficiaryKey: buildBeneficiaryKey(buildEmployeeKey('tigo-2026', '2222222222'), 'Otro', 3, 'female'),
      }),
      makeNormalizedRow({ excelRow: 6, beneficiaryKey: keyA, beneficiaryFullName: 'Lola' }),
    ];
    const issues = detectCrossRowIssues(rows);
    expect(issues).toHaveLength(1);
    expect(issues[0].row).toBe(6);
    expect(issues[0].relatedRow).toBe(4);
  });

  it('#3 same employee with different beneficiaries is valid (no duplicate issue)', () => {
    const ek = buildEmployeeKey('tigo-2026', '8000000000');
    const rows = [
      makeNormalizedRow({ excelRow: 2, employeeKey: ek, employeeDocumentId: '8000000000', beneficiaryFullName: 'Hijo A', beneficiaryKey: buildBeneficiaryKey(ek, 'Hijo A', 6, 'male') }),
      makeNormalizedRow({ excelRow: 3, employeeKey: ek, employeeDocumentId: '8000000000', beneficiaryFullName: 'Hija B', beneficiaryKey: buildBeneficiaryKey(ek, 'Hija B', 9, 'female') }),
    ];
    expect(detectCrossRowIssues(rows)).toEqual([]);
  });

  it('#4 same beneficiary name under different employees is not a duplicate', () => {
    const ek1 = buildEmployeeKey('tigo-2026', '7000000001');
    const ek2 = buildEmployeeKey('tigo-2026', '7000000002');
    const rows = [
      makeNormalizedRow({ excelRow: 2, employeeKey: ek1, employeeDocumentId: '7000000001', beneficiaryFullName: 'Ana', beneficiaryKey: buildBeneficiaryKey(ek1, 'Ana', 7, 'female') }),
      makeNormalizedRow({ excelRow: 3, employeeKey: ek2, employeeDocumentId: '7000000002', beneficiaryFullName: 'Ana', beneficiaryKey: buildBeneficiaryKey(ek2, 'Ana', 7, 'female') }),
    ];
    expect(detectCrossRowIssues(rows)).toEqual([]);
  });

  it('#5 duplicate normalization catches case and surrounding spaces', () => {
    const ek = buildEmployeeKey('tigo-2026', '5555555555');
    expect(normalizeName('  ANA ')).toBe(normalizeName('Ana')); // 'ana'
    const k1 = buildBeneficiaryKey(ek, 'Ana', 4, 'female');
    const k2 = buildBeneficiaryKey(ek, '  ANA ', 4, 'female');
    expect(k1).toBe(k2);
    const rows = [
      makeNormalizedRow({ excelRow: 8, employeeKey: ek, employeeDocumentId: '5555555555', beneficiaryFullName: 'Ana', beneficiaryKey: k1 }),
      makeNormalizedRow({ excelRow: 9, employeeKey: ek, employeeDocumentId: '5555555555', beneficiaryFullName: '  ANA ', beneficiaryKey: k2 }),
    ];
    const issues = detectCrossRowIssues(rows);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe(CODE.DUPLICATE_BENEFICIARY_IN_FILE);
    expect(issues[0].row).toBe(9);
    expect(issues[0].relatedRow).toBe(8);
  });

  it('#5b three occurrences each reference the first occurrence', () => {
    const ek = buildEmployeeKey('tigo-2026', '5555555555');
    const k = buildBeneficiaryKey(ek, 'ana', 4, 'female');
    const rows = [
      makeNormalizedRow({ excelRow: 10, employeeKey: ek, beneficiaryKey: k }),
      makeNormalizedRow({ excelRow: 12, employeeKey: ek, beneficiaryKey: k }),
      makeNormalizedRow({ excelRow: 14, employeeKey: ek, beneficiaryKey: k }),
    ];
    const issues = detectCrossRowIssues(rows);
    expect(issues).toHaveLength(2);
    expect(issues[0].row).toBe(12);
    expect(issues[0].relatedRow).toBe(10);
    expect(issues[1].row).toBe(14);
    expect(issues[1].relatedRow).toBe(10);
  });

  // ── Email (#6–#11) ─────────────────────────────────────────────────────

  it('#6 valid email is accepted', () => {
    expect(checkEmail(2, 'employeeEmail', 'david@example.com', false)).toEqual([]);
  });

  it('#7 uppercase email is normalized to lowercase and accepted', () => {
    expect(checkEmail(2, 'employeeEmail', 'DAVID@Test.COM', false)).toEqual([]);
    const issues = checkEmail(2, 'employeeEmail', 'DAVID@', false);
    expect(issues).toHaveLength(1);
    expect(issues[0].value).toBe('david@'); // stored normalized
  });

  it('#8 missing required email is rejected', () => {
    const issues = checkEmail(2, 'employeeEmail', '', true);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe(CODE.MISSING_REQUIRED_VALUE);
    expect(issues[0].severity).toBe(ERROR);
  });

  it('#8b empty optional email is accepted (audit behavior preserved)', () => {
    expect(checkEmail(2, 'employeeEmail', '', false)).toEqual([]);
    expect(checkEmail(2, 'employeeEmail', '   ', false)).toEqual([]);
  });

  it('#9 "david@" is rejected (INVALID_EMAIL)', () => {
    const issues = checkEmail(2, 'employeeEmail', 'david@', false);
    expect(issueCodes(issues)).toContain(CODE.INVALID_EMAIL);
  });

  it('#10 email with internal spaces is rejected', () => {
    const issues = checkEmail(2, 'employeeEmail', 'da vid@example.com', false);
    expect(issueCodes(issues)).toContain(CODE.INVALID_EMAIL);
  });

  it(`#11 email longer than ${MAX_EMAIL_LEN} characters is rejected`, () => {
    const longLocal = 'a'.repeat(MAX_EMAIL_LEN); // way over 180 once domain added
    const email = `${longLocal}@example.com`;
    const issues = checkEmail(2, 'employeeEmail', email, false);
    expect(issueCodes(issues)).toContain(CODE.VALUE_TOO_LONG);
  });

  // ── Phone (#12–#17) ─────────────────────────────────────────────────────

  it('#12 empty optional phone is accepted', () => {
    expect(checkPhone(2, 'employeePhone', '', false)).toEqual([]);
    expect(checkPhone(2, 'employeePhone', '   ', false)).toEqual([]);
  });

  it('#13 plain numeric phone is accepted', () => {
    expect(checkPhone(2, 'employeePhone', '3001234567', false)).toEqual([]);
  });

  it('#14 `+57 300 123 4567` is accepted', () => {
    expect(checkPhone(2, 'employeePhone', '+57 300 123 4567', false)).toEqual([]);
  });

  it('#15 formatted phone with spaces/hyphens/parentheses is accepted', () => {
    expect(checkPhone(2, 'employeePhone', '(601) 123-4567', false)).toEqual([]);
    expect(checkPhone(2, 'employeePhone', '300-123-4567', false)).toEqual([]);
  });

  it('#16 phone containing letters is rejected', () => {
    const issues = checkPhone(2, 'employeePhone', '300ABC1234', false);
    expect(issueCodes(issues)).toContain(CODE.INVALID_PHONE_FORMAT);
  });

  it(`#17 phone longer than ${MAX_PHONE_LEN} characters is rejected`, () => {
    const long = '1'.repeat(MAX_PHONE_LEN + 1);
    const issues = checkPhone(2, 'employeePhone', long, false);
    expect(issueCodes(issues)).toContain(CODE.PHONE_LENGTH_OUT_OF_RANGE);
  });

  // ── Employee document (#18–#23) ─────────────────────────────────────────

  it(`#18 ${MIN_DOCUMENT_DIGITS}-digit document is accepted`, () => {
    expect(checkDocument(2, 'employeeDocumentId', '123456')).toEqual([]);
  });

  it(`#19 ${MAX_DOCUMENT_DIGITS}-digit document is accepted`, () => {
    expect(checkDocument(2, 'employeeDocumentId', '1234567890')).toEqual([]);
  });

  it('#20 five-digit document is rejected (out of range)', () => {
    const issues = checkDocument(2, 'employeeDocumentId', '12345');
    expect(issueCodes(issues)).toContain(CODE.DOCUMENT_LENGTH_OUT_OF_RANGE);
  });

  it('#21 eleven-digit document is rejected (out of range)', () => {
    const issues = checkDocument(2, 'employeeDocumentId', '12345678901');
    expect(issueCodes(issues)).toContain(CODE.DOCUMENT_LENGTH_OUT_OF_RANGE);
  });

  it('#22 alphanumeric document is rejected (invalid format)', () => {
    const issues = checkDocument(2, 'employeeDocumentId', '12A456');
    expect(issueCodes(issues)).toContain(CODE.INVALID_DOCUMENT_FORMAT);
    expect(issueCodes(issues)).not.toContain(CODE.DOCUMENT_LENGTH_OUT_OF_RANGE);
  });

  it('#23 `001234` remains six digits and is accepted (leading zeroes preserved)', () => {
    const issues = checkDocument(2, 'employeeDocumentId', '001234');
    expect(issues).toEqual([]);
    // value reported (if any issue existed) preserves leading zeroes; here none
  });

  it('#23b leading-zeroes document preserved in reported value on length error', () => {
    const issues = checkDocument(2, 'employeeDocumentId', '00123456789');
    expect(issueCodes(issues)).toContain(CODE.DOCUMENT_LENGTH_OUT_OF_RANGE);
    expect(issues[0].value).toBe('00123456789'); // leading zeros preserved
  });

  // ── Several errors in the same row are all returned (#25) ───────────────

  it('#25 several errors in the same row are all returned with distinct codes', () => {
    const row = 2;
    const all: ImportIssue[] = [];
    all.push(...checkEmail(row, 'employeeEmail', 'david@', false));
    all.push(...checkPhone(row, 'employeePhone', '300ABC1234', false));
    all.push(...checkDocument(row, 'employeeDocumentId', '12A456'));
    all.push(...checkBeneficiaryAge(row, 'beneficiaryAge', '99'));
    all.push(...checkBeneficiaryGender(row, 'beneficiaryGender', 'otro'));
    expect(all.length).toBeGreaterThanOrEqual(5);
    expect(all.every((i) => i.row === row)).toBe(true);
    expect(new Set(all.map((i) => i.code)).size).toBe(all.length);
  });

  // ── Cross-row employee conflicts (option 3 — blocking) ─────────────────

  it('same employee with conflicting email across rows is a blocking conflict', () => {
    const ek = buildEmployeeKey('tigo-2026', '4444444444');
    const rows = [
      makeNormalizedRow({ excelRow: 3, employeeKey: ek, employeeDocumentId: '4444444444', employeeEmail: 'a@x.com', employeeInfoTuple: null }),
      makeNormalizedRow({ excelRow: 4, employeeKey: ek, employeeDocumentId: '4444444444', employeeEmail: 'b@x.com', employeeInfoTuple: null }),
    ];
    const issues = detectCrossRowIssues(rows);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe(CODE.CONFLICTING_EMPLOYEE_DATA);
    expect(issues[0].column).toBe('employeeEmail');
    expect(issues[0].relatedRow).toBe(3);
    expect(issues[0].row).toBe(4);
  });

  it('same employee with identical info but different beneficiaries has no conflict', () => {
    const ek = buildEmployeeKey('tigo-2026', '4444444444');
    const rows = [
      makeNormalizedRow({ excelRow: 3, employeeKey: ek, employeeDocumentId: '4444444444', employeeEmail: 'a@x.com', beneficiaryFullName: 'A', beneficiaryKey: buildBeneficiaryKey(ek, 'A', 1, 'male') }),
      makeNormalizedRow({ excelRow: 4, employeeKey: ek, employeeDocumentId: '4444444444', employeeEmail: 'a@x.com', beneficiaryFullName: 'B', beneficiaryKey: buildBeneficiaryKey(ek, 'B', 1, 'male') }),
    ];
    expect(detectCrossRowIssues(rows)).toEqual([]);
  });

  // ── Headers ──────────────────────────────────────────────────────────────

  it('validateHeaders flags every missing required header', () => {
    const issues = validateHeaders(['campaignSlug', 'employeeDocumentId']);
    const missing = issues.map((i) => i.column);
    expect(missing).toEqual(
      expect.arrayContaining([
        'employeeFullName',
        'employeeEmail',
        'employeePhone',
        'shippingAddress',
        'shippingCity',
        'beneficiaryFullName',
        'beneficiaryAge',
        'beneficiaryGender',
      ]),
    );
    expect(issues.every((i) => i.code === CODE.MISSING_REQUIRED_HEADER && i.severity === ERROR)).toBe(true);
    expect(issues.every((i) => i.row === 1)).toBe(true);
  });

  it('validateHeaders passes when all headers present', () => {
    expect(
      validateHeaders([
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
      ]),
    ).toEqual([]);
  });

  // ── Gender / age ────────────────────────────────────────────────────────

  it('normalizeGender accepts male/masculino/m and female/femenino/f', () => {
    expect(normalizeGender('M')).toBe('male');
    expect(normalizeGender('Masculino')).toBe('male');
    expect(normalizeGender('FEMENINO')).toBe('female');
    expect(normalizeGender('f')).toBe('female');
    expect(normalizeGender('otro')).toBeNull();
  });

  it('checkBeneficiaryAge rejects out-of-range and non-integer', () => {
    expect(issueCodes(checkBeneficiaryAge(2, 'beneficiaryAge', '14'))).toContain(CODE.INVALID_BENEFICIARY_AGE);
    expect(issueCodes(checkBeneficiaryAge(2, 'beneficiaryAge', '-1'))).toContain(CODE.INVALID_BENEFICIARY_AGE);
    expect(issueCodes(checkBeneficiaryAge(2, 'beneficiaryAge', 'abc'))).toContain(CODE.INVALID_BENEFICIARY_AGE);
    expect(checkBeneficiaryAge(2, 'beneficiaryAge', '7')).toEqual([]);
  });
});
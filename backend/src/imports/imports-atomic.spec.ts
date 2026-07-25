import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { ImportsService } from './imports.service';
import { EXPECTED_HEADERS } from './import-validation';

/**
 * Atomic-rule integration tests. A real .xlsx is built in memory with ExcelJS
 * so the service's parsing code path is exercised. PrismaService is mocked,
 * and the key assertion is: when there is at least one blocking (ERROR-severity)
 * issue, no Prisma WRITE method may be called and `$transaction` must NOT be
 * invoked.
 */

async function buildWorkbook(
  rows: Array<Record<string, unknown>>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.addRow([...EXPECTED_HEADERS]);
  for (const r of rows) {
    ws.addRow(EXPECTED_HEADERS.map((h) => (r[h] === undefined ? '' : r[h])));
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as unknown as ArrayBuffer);
}

function mockFile(buffer: Buffer): Express.Multer.File {
  return {
    buffer,
    originalname: 'import.xlsx',
    encoding: '7bit',
    mimetype:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fieldname: 'file',
    size: buffer.length,
  } as unknown as Express.Multer.File;
}

const CAMPAIGN = { id: 1, slug: 'tigo-2026', status: 'DRAFT' };

function createMockPrisma() {
  const tx = {
    employee: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    beneficiary: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    campaign: {
      findMany: jest.fn().mockResolvedValue([CAMPAIGN]),
    },
    employee: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
    beneficiary: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  return { prisma, tx };
}

function validRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    campaignSlug: 'tigo-2026',
    employeeDocumentId: '1234567890',
    employeeFullName: 'Empleado Prueba',
    employeeEmail: 'david@example.com',
    employeePhone: '+57 300 123 4567',
    shippingAddress: 'Calle 1 # 2-3',
    shippingCity: 'Bogotá',
    beneficiaryFullName: 'Ben Beneficiario',
    beneficiaryAge: 7,
    beneficiaryGender: 'female',
    ...overrides,
  };
}

describe('Import atomic rule (zero DB writes on blocking error)', () => {
  it('#24/#A: a single blocking error results in zero database writes', async () => {
    const { prisma } = createMockPrisma();
    const service = new ImportsService(prisma as any);

    const buffer = await buildWorkbook([
      validRow({ employeeEmail: 'david@' }), // INVALID_EMAIL (blocking)
    ]);
    const result = await service.importEmployeesBeneficiaries(
      mockFile(buffer),
      1,
    );

    expect(result.canImport).toBe(false);
    expect(result.employeesCreated).toBe(0);
    expect(result.employeesUpdated).toBe(0);
    expect(result.beneficiariesCreated).toBe(0);
    expect(result.beneficiariesUpdated).toBe(0);
    expect(result.skippedRows).toBe(0);
    expect(result.errorCount).toBeGreaterThan(0);
    // The atomic guarantee — no transaction, no writes.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.employee.createMany).not.toHaveBeenCalled();
    expect(prisma.employee.update).not.toHaveBeenCalled();
    expect(prisma.beneficiary.createMany).not.toHaveBeenCalled();
  });

  it('#B: 100 blocking errors still result in zero database writes', async () => {
    const { prisma } = createMockPrisma();
    const service = new ImportsService(prisma as any);

    const rows = Array.from({ length: 100 }, (_, i) =>
      validRow({
        employeeDocumentId: 'abc' + String(i).padStart(2, '0'), // INVALID_DOCUMENT_FORMAT
        employeeEmail: `bad${i}@`, // INVALID_EMAIL
      }),
    );
    const buffer = await buildWorkbook(rows);
    const result = await service.importEmployeesBeneficiaries(
      mockFile(buffer),
      1,
    );

    expect(result.canImport).toBe(false);
    expect(result.employeesCreated).toBe(0);
    expect(result.beneficiariesCreated).toBe(0);
    expect(result.errorCount).toBeGreaterThanOrEqual(100);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.beneficiary.createMany).not.toHaveBeenCalled();
  });

  it('#D: exact beneficiary duplicate in file is blocking and performs zero writes', async () => {
    const { prisma } = createMockPrisma();
    const service = new ImportsService(prisma as any);

    const buffer = await buildWorkbook([
      validRow({ beneficiaryFullName: 'Ana', beneficiaryAge: 7 }),
      validRow({ beneficiaryFullName: 'Ana', beneficiaryAge: 7 }), // duplicate
    ]);
    const result = await service.importEmployeesBeneficiaries(
      mockFile(buffer),
      1,
    );

    expect(result.canImport).toBe(false);
    expect(result.beneficiariesCreated).toBe(0);
    const dup = result.issues.find(
      (i) => i.code === 'DUPLICATE_BENEFICIARY_IN_FILE',
    );
    expect(dup).toBeDefined();
    expect(dup!.relatedRow).toBe(2);
    expect(dup!.row).toBe(3);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('#E: conflicting employee data is blocking and performs zero writes', async () => {
    const { prisma } = createMockPrisma();
    const service = new ImportsService(prisma as any);

    const buffer = await buildWorkbook([
      validRow({ employeeEmail: 'a@x.com', beneficiaryFullName: 'B1' }),
      validRow({ employeeEmail: 'b@x.com', beneficiaryFullName: 'B2' }), // same employee, diff email
    ]);
    const result = await service.importEmployeesBeneficiaries(
      mockFile(buffer),
      1,
    );

    expect(result.canImport).toBe(false);
    const conflict = result.issues.find(
      (i) => i.code === 'CONFLICTING_EMPLOYEE_DATA',
    );
    expect(conflict).toBeDefined();
    expect(conflict!.relatedRow).toBe(2);
    expect(conflict!.row).toBe(3);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('#F: missing required header is blocking and performs zero writes', async () => {
    const { prisma } = createMockPrisma();
    const service = new ImportsService(prisma as any);

    // Build a workbook that is missing the 'beneficiaryAge' header column.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Hoja1');
    const headers = [...EXPECTED_HEADERS].filter((h) => h !== 'beneficiaryAge');
    ws.addRow(headers);
    ws.addRow([
      'tigo-2026', '1234567890', 'Empleado Prueba',
      'david@example.com', '3001234567', 'Calle 1', 'Bogotá',
      'Ben', 'female',
    ]);
    const buffer = Buffer.from((await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer);

    const result = await service.importEmployeesBeneficiaries(
      mockFile(buffer),
      1,
    );

    expect(result.canImport).toBe(false);
    expect(result.issues.some((i) => i.code === 'MISSING_REQUIRED_HEADER')).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('#G: a file with NO errors proceeds to database writes (happy path still works)', async () => {
    const { prisma, tx } = createMockPrisma();
    // Wire $transaction to run the callback with the tx mock.
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(tx));
    // Re-fetch of created employees returns one employee with an id.
    tx.employee.findMany
      .mockResolvedValueOnce([]) // existing employees for batch (none)
      .mockResolvedValueOnce([
        { id: 101, campaignId: 1, documentId: '1234567890', fullName: 'Empleado Prueba', email: 'david@example.com', phone: '+57 300 123 4567', shippingAddress: 'Calle 1 # 2-3', shippingCity: 'Bogotá', status: 'PENDING' },
      ]);
    tx.employee.createMany.mockResolvedValue({ count: 1 });
    tx.beneficiary.createMany.mockResolvedValue({ count: 1 });

    const service = new ImportsService(prisma as any);
    const buffer = await buildWorkbook([validRow()]);
    const result = await service.importEmployeesBeneficiaries(
      mockFile(buffer),
      1,
    );

    expect(result.canImport).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.employee.createMany).toHaveBeenCalled();
    expect(tx.beneficiary.createMany).toHaveBeenCalled();
    expect(result.employeesCreated).toBe(1);
    expect(result.beneficiariesCreated).toBe(1);
  });

  it('#H: non-open campaign status is blocking and performs zero writes', async () => {
    const prisma = {
      campaign: { findMany: jest.fn().mockResolvedValue([{ id: 1, slug: 'tigo-2026', status: 'CLOSED' }]) },
      employee: { findMany: jest.fn(), createMany: jest.fn(), update: jest.fn() },
      beneficiary: { findMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new ImportsService(prisma as any);

    const buffer = await buildWorkbook([validRow()]);
    const result = await service.importEmployeesBeneficiaries(
      mockFile(buffer),
      1,
    );

    expect(result.canImport).toBe(false);
    expect(result.issues.some((i) => i.code === 'CAMPAIGN_STATUS_NOT_OPEN')).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('#I: unknown campaign slug is blocking and performs zero writes', async () => {
    const prisma = {
      campaign: { findMany: jest.fn().mockResolvedValue([]) }, // nothing found
      employee: { findMany: jest.fn(), createMany: jest.fn(), update: jest.fn() },
      beneficiary: { findMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new ImportsService(prisma as any);

    const buffer = await buildWorkbook([validRow()]);
    const result = await service.importEmployeesBeneficiaries(
      mockFile(buffer),
      1,
    );

    expect(result.canImport).toBe(false);
    expect(result.issues.some((i) => i.code === 'CAMPAIGN_NOT_FOUND')).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
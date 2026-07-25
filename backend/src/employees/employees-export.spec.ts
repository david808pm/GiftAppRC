import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EmployeesService.exportXlsx', () => {
  let service: EmployeesService;
  let prisma: {
    employee: { findMany: jest.Mock };
  };

  const c1 = { company: { name: 'Tigo' }, name: 'Campaña Navidad', slug: 'tigo-navidad' };
  const c2 = { company: { name: 'Claro' }, name: 'Campaña Verano', slug: 'claro-verano' };

  function emp(overrides: Record<string, unknown> = {}) {
    return {
      fullName: 'Juan Pérez',
      documentId: '00100',
      email: 'juan@test.com',
      phone: '3001234567',
      shippingAddress: 'Calle 10',
      shippingCity: 'Bogotá',
      status: 'PENDING',
      createdAt: new Date('2026-01-15T10:00:00Z'),
      updatedAt: new Date('2026-06-01T14:00:00Z'),
      campaign: c1,
      _count: { beneficiaries: 2 },
      ...overrides,
    };
  }

  function empWithFullDocId() {
    return emp({ documentId: '00123456' });
  }

  function empFormulaInjection() {
    return emp({
      fullName: '=CMD|calc.exe',
      documentId: '+100',
      email: '@juan@test.com',
      shippingAddress: '-Calle 10',
      shippingCity: '=Bogotá',
      campaign: {
        company: { name: '=EvilCorp' },
        name: '+Campaign',
        slug: '-slug',
      },
    });
  }

  beforeEach(async () => {
    const prismaMock = {
      employee: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(EmployeesService);
    prisma = prismaMock as any;
  });

  // ═══════════════════════════════════════════════════════════
  // Default status behavior
  // ═══════════════════════════════════════════════════════════

  describe('default status behavior', () => {
    it('should export PENDING, IN_PROGRESS and CONFIRMED by default', async () => {
      prisma.employee.findMany.mockResolvedValue([emp(), emp({ status: 'IN_PROGRESS' }), emp({ status: 'CONFIRMED' })]);

      await service.exportXlsx({});

      const where = prisma.employee.findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({ in: ['PENDING', 'IN_PROGRESS', 'CONFIRMED'] });
      expect(where.deletedAt).toBeNull();
    });

    it('should exclude BLOCKED by default', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      await service.exportXlsx({});

      const where = prisma.employee.findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({ in: ['PENDING', 'IN_PROGRESS', 'CONFIRMED'] });
      expect((where.status as any).in).not.toContain('BLOCKED');
    });

    it('should export explicit valid status', async () => {
      prisma.employee.findMany.mockResolvedValue([emp({ status: 'CONFIRMED' })]);

      await service.exportXlsx({ status: 'CONFIRMED' });

      const where = prisma.employee.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('CONFIRMED');
    });

    it('should reject BLOCKED status with HTTP 400', async () => {
      await expect(service.exportXlsx({ status: 'BLOCKED' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject invalid status with HTTP 400', async () => {
      await expect(service.exportXlsx({ status: 'INVALID' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Campaign and search filters
  // ═══════════════════════════════════════════════════════════

  describe('filters', () => {
    it('should filter by campaignId when provided', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      await service.exportXlsx({ campaignId: 5 });

      const where = prisma.employee.findMany.mock.calls[0][0].where;
      expect(where.campaignId).toBe(5);
    });

    it('should filter by search across multiple fields', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      await service.exportXlsx({ search: 'juan' });

      const where = prisma.employee.findMany.mock.calls[0][0].where;
      expect(where.OR).toBeDefined();
      expect(where.OR!.length).toBeGreaterThanOrEqual(6);
    });

    it('should combine status, campaign and search filters', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      await service.exportXlsx({ status: 'PENDING', campaignId: 3, search: 'test' });

      const where = prisma.employee.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('PENDING');
      expect(where.campaignId).toBe(3);
      expect(where.OR).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // No pagination
  // ═══════════════════════════════════════════════════════════

  describe('no pagination', () => {
    it('should not use skip or take (exports all matching records)', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      await service.exportXlsx({});

      const args = prisma.employee.findMany.mock.calls[0][0];
      expect(args.skip).toBeUndefined();
      expect(args.take).toBeUndefined();
    });

    it('should export all matching records when many exist', async () => {
      const manyEmployees = Array.from({ length: 100 }, (_, i) =>
        emp({ fullName: `Employee ${i}`, documentId: String(i).padStart(5, '0') }),
      );
      prisma.employee.findMany.mockResolvedValue(manyEmployees);

      const buffer = await service.exportXlsx({});

      expect(buffer).toBeDefined();
      expect(Buffer.isBuffer(buffer)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Deterministic ordering
  // ═══════════════════════════════════════════════════════════

  describe('deterministic ordering', () => {
    it('should order by company, campaign, fullName, documentId', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      await service.exportXlsx({});

      const args = prisma.employee.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual([
        { campaign: { company: { name: 'asc' } } },
        { campaign: { name: 'asc' } },
        { fullName: 'asc' },
        { documentId: 'asc' },
      ]);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Prisma query structure — single query, no N+1
  // ═══════════════════════════════════════════════════════════

  describe('Prisma query structure', () => {
    it('should make exactly one Prisma call', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      await service.exportXlsx({});

      expect(prisma.employee.findMany).toHaveBeenCalledTimes(1);
    });

    it('should select only required fields', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      await service.exportXlsx({});

      const args = prisma.employee.findMany.mock.calls[0][0];
      expect(args.select).toBeDefined();
      const sel = args.select!;
      expect(sel.fullName).toBe(true);
      expect(sel.documentId).toBe(true);
      expect(sel.status).toBe(true);
      expect(sel['deletedAt']).toBeUndefined();
      expect(sel['createdById']).toBeUndefined();
      expect(sel['updatedById']).toBeUndefined();
      expect(sel['emailOtpHash']).toBeUndefined();
      expect(sel['emailOtpExpiresAt']).toBeUndefined();
    });

    it('should include _count of beneficiaries', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      await service.exportXlsx({});

      const args = prisma.employee.findMany.mock.calls[0][0];
      expect(args.select!._count).toEqual({ select: { beneficiaries: true } });
    });

    it('should include campaign with company name', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      await service.exportXlsx({});

      const args = prisma.employee.findMany.mock.calls[0][0];
      expect(args.select!.campaign).toEqual({
        select: {
          name: true,
          slug: true,
          company: { select: { name: true } },
        },
      });
    });

    it('should exclude deleted employees', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      await service.exportXlsx({});

      const where = prisma.employee.findMany.mock.calls[0][0].where;
      expect(where.deletedAt).toBeNull();
    });

    it('should exclude employees from deleted campaigns', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      await service.exportXlsx({});

      const where = prisma.employee.findMany.mock.calls[0][0].where;
      expect((where.campaign as any).deletedAt).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Authorization — COMPANY_VIEWER scoping
  // ═══════════════════════════════════════════════════════════

  describe('COMPANY_VIEWER scoping', () => {
    it('should enforce company scope for COMPANY_VIEWER', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      await service.exportXlsx({}, { role: 'COMPANY_VIEWER', companyId: 1 });

      const where = prisma.employee.findMany.mock.calls[0][0].where;
      expect((where.campaign as any).companyId).toBe(1);
      expect((where.campaign as any).deletedAt).toBeNull();
    });

    it('should reject COMPANY_VIEWER without companyId', async () => {
      await expect(
        service.exportXlsx({}, { role: 'COMPANY_VIEWER' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should NOT apply company scope for SUPER_ADMIN', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      await service.exportXlsx({}, { role: 'SUPER_ADMIN' });

      const where = prisma.employee.findMany.mock.calls[0][0].where;
      expect((where.campaign as any).companyId).toBeUndefined();
    });

    it('should NOT apply company scope for ADMIN', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      await service.exportXlsx({}, { role: 'ADMIN' });

      const where = prisma.employee.findMany.mock.calls[0][0].where;
      // ADMIN has no company scope — same as SUPER_ADMIN
      expect((where.campaign as any).companyId).toBeUndefined();
    });

    it('should apply cross-company isolation: request query cannot override company scope', async () => {
      prisma.employee.findMany.mockResolvedValue([]);

      // COMPANY_VIEWER (companyId=1) tries to access campaignId=99 from another company
      await service.exportXlsx({ campaignId: 99 }, { role: 'COMPANY_VIEWER', companyId: 1 });

      const where = prisma.employee.findMany.mock.calls[0][0].where;
      // Both scopes apply: campaign.companyId=1 AND campaignId=99
      // If campaign 99 belongs to another company, 0 results — safe
      expect((where.campaign as any).companyId).toBe(1);
      expect(where.campaignId).toBe(99);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Excel workbook structure
  // ═══════════════════════════════════════════════════════════

  describe('Excel workbook structure', () => {
    it('should generate a valid xlsx buffer', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      const buffer = await service.exportXlsx({});

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should produce a sheet named "Empleados"', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      const buffer = await service.exportXlsx({});
      const wb = new (require('exceljs')).Workbook();
      await wb.xlsx.load(buffer);

      expect(wb.worksheets[0].name).toBe('Empleados');
    });

    it('should have 13 columns with Spanish labels', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      const buffer = await service.exportXlsx({});
      const wb = new (require('exceljs')).Workbook();
      await wb.xlsx.load(buffer);

      const headers = (wb.worksheets[0].getRow(1).values as string[]).slice(1); // skip row number placeholder
      expect(headers).toEqual([
        'Empresa',
        'Campaña',
        'Slug de campaña',
        'Documento',
        'Nombre completo',
        'Correo electrónico',
        'Teléfono',
        'Dirección de entrega',
        'Ciudad',
        'Estado',
        'Cantidad de beneficiarios',
        'Fecha de creación',
        'Fecha de última actualización',
      ]);
    });

    it('should translate employee status to Spanish', async () => {
      prisma.employee.findMany.mockResolvedValue([
        emp({ status: 'PENDING' }),
        emp({ status: 'IN_PROGRESS' }),
        emp({ status: 'CONFIRMED' }),
      ]);

      const buffer = await service.exportXlsx({});
      const wb = new (require('exceljs')).Workbook();
      await wb.xlsx.load(buffer);

      const ws = wb.worksheets[0];
      expect(ws.getRow(2).getCell(10).value).toBe('Pendiente');
      expect(ws.getRow(3).getCell(10).value).toBe('En progreso');
      expect(ws.getRow(4).getCell(10).value).toBe('Confirmado');
    });

    it('should map employee data correctly to rows', async () => {
      prisma.employee.findMany.mockResolvedValue([empWithFullDocId()]);

      const buffer = await service.exportXlsx({});
      const wb = new (require('exceljs')).Workbook();
      await wb.xlsx.load(buffer);

      const ws = wb.worksheets[0];
      const row = ws.getRow(2);
      expect(row.getCell(1).value).toBe('Tigo');
      expect(row.getCell(2).value).toBe('Campaña Navidad');
      expect(row.getCell(3).value).toBe('tigo-navidad');
      expect(row.getCell(4).value).toBe('00123456');
      expect(row.getCell(5).value).toBe('Juan Pérez');
      expect(row.getCell(6).value).toBe('juan@test.com');
      expect(row.getCell(7).value).toBe('3001234567');
      expect(row.getCell(8).value).toBe('Calle 10');
      expect(row.getCell(9).value).toBe('Bogotá');
      expect(row.getCell(10).value).toBe('Pendiente');
      expect(row.getCell(11).value).toBe(2);
    });

    it('should preserve leading zeros in documentId', async () => {
      prisma.employee.findMany.mockResolvedValue([emp({ documentId: '00100' })]);

      const buffer = await service.exportXlsx({});
      const wb = new (require('exceljs')).Workbook();
      await wb.xlsx.load(buffer);

      const ws = wb.worksheets[0];
      expect(ws.getRow(2).getCell(4).value).toBe('00100');
      // Cast to string — ExcelJS may store as string or number
      const docValue = String(ws.getRow(2).getCell(4).value);
      expect(docValue).toBe('00100');
    });

    it('should use blank cells for null optional values', async () => {
      prisma.employee.findMany.mockResolvedValue([
        emp({ email: null, phone: null, shippingAddress: null, shippingCity: null }),
      ]);

      const buffer = await service.exportXlsx({});
      const wb = new (require('exceljs')).Workbook();
      await wb.xlsx.load(buffer);

      const ws = wb.worksheets[0];
      const row = ws.getRow(2);
      // Null values are converted to empty strings by sanitizeExcelCell
      expect(row.getCell(6).value).toBe('');
      expect(row.getCell(7).value).toBe('');
      expect(row.getCell(8).value).toBe('');
      expect(row.getCell(9).value).toBe('');
    });

    it('should NOT include internal employee database ID', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      const buffer = await service.exportXlsx({});
      const wb = new (require('exceljs')).Workbook();
      await wb.xlsx.load(buffer);

      const headers = (wb.worksheets[0].getRow(1).values as string[]).slice(1);
      expect(headers).not.toContain('ID');
      expect(headers).not.toContain('id');
    });

    it('should NOT include OTP fields or internal fields', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      await service.exportXlsx({});

      const args = prisma.employee.findMany.mock.calls[0][0];
      const sel = args.select!;
      // These internal/OTP fields must not be selected
      expect(sel['deletedAt']).toBeUndefined();
      expect(sel['createdById']).toBeUndefined();
      expect(sel['updatedById']).toBeUndefined();
      expect(sel['emailOtpHash']).toBeUndefined();
      expect(sel['emailOtpExpiresAt']).toBeUndefined();
      expect(sel['emailOtpSentAt']).toBeUndefined();
      expect(sel['emailOtpLastUsedAt']).toBeUndefined();
      expect(sel['emailOtpLockedUntil']).toBeUndefined();
      expect(sel['emailOtpAttempts']).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Formula injection protection
  // ═══════════════════════════════════════════════════════════

  describe('formula injection protection', () => {
    it('should sanitize formula-like values starting with =', async () => {
      prisma.employee.findMany.mockResolvedValue([empFormulaInjection()]);

      const buffer = await service.exportXlsx({});
      const wb = new (require('exceljs')).Workbook();
      await wb.xlsx.load(buffer);

      const ws = wb.worksheets[0];
      const row = ws.getRow(2);
      expect(row.getCell(1).value).toBe("'=EvilCorp");
      expect(row.getCell(5).value).toBe("'=CMD|calc.exe");
      expect(row.getCell(9).value).toBe("'=Bogotá");
    });

    it('should sanitize formula-like values starting with +', async () => {
      prisma.employee.findMany.mockResolvedValue([empFormulaInjection()]);

      const buffer = await service.exportXlsx({});
      const wb = new (require('exceljs')).Workbook();
      await wb.xlsx.load(buffer);

      const ws = wb.worksheets[0];
      expect(ws.getRow(2).getCell(4).value).toBe("'+100");
      expect(ws.getRow(2).getCell(2).value).toBe("'+Campaign");
    });

    it('should sanitize formula-like values starting with @', async () => {
      prisma.employee.findMany.mockResolvedValue([empFormulaInjection()]);

      const buffer = await service.exportXlsx({});
      const wb = new (require('exceljs')).Workbook();
      await wb.xlsx.load(buffer);

      const ws = wb.worksheets[0];
      expect(ws.getRow(2).getCell(6).value).toBe("'@juan@test.com");
    });

    it('should sanitize formula-like values starting with -', async () => {
      prisma.employee.findMany.mockResolvedValue([empFormulaInjection()]);

      const buffer = await service.exportXlsx({});
      const wb = new (require('exceljs')).Workbook();
      await wb.xlsx.load(buffer);

      const ws = wb.worksheets[0];
      expect(ws.getRow(2).getCell(8).value).toBe("'-Calle 10");
      expect(ws.getRow(2).getCell(3).value).toBe("'-slug");
    });

    it('should not sanitize normal values', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      const buffer = await service.exportXlsx({});
      const wb = new (require('exceljs')).Workbook();
      await wb.xlsx.load(buffer);

      const ws = wb.worksheets[0];
      expect(ws.getRow(2).getCell(5).value).toBe('Juan Pérez');
      expect(ws.getRow(2).getCell(4).value).toBe('00100');
      expect(ws.getRow(2).getCell(6).value).toBe('juan@test.com');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Workbook header styling
  // ═══════════════════════════════════════════════════════════

  describe('workbook header styling', () => {
    it('should apply dark-blue header with frozen row', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      const buffer = await service.exportXlsx({});
      const wb = new (require('exceljs')).Workbook();
      await wb.xlsx.load(buffer);

      const ws = wb.worksheets[0];
      const headerRow = ws.getRow(1);
      expect(headerRow.font).toBeDefined();
      expect((headerRow.font as any).bold).toBe(true);
      expect(ws.views).toBeDefined();
      expect((ws.views as any)[0]?.state).toBe('frozen');
      expect((ws.views as any)[0]?.ySplit).toBe(1);
    });

    it('should have autoFilter defined on worksheet', async () => {
      prisma.employee.findMany.mockResolvedValue([emp()]);

      const buffer = await service.exportXlsx({});
      const wb = new (require('exceljs')).Workbook();
      await wb.xlsx.load(buffer);

      const ws = wb.worksheets[0];
      expect(ws.autoFilter).toBeDefined();
    });
  });
});

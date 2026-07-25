import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { SelectionsService } from './selections.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SelectionsService.exportXlsx — compatibility verification', () => {
  let service: SelectionsService;
  let prisma: { selection: { findMany: jest.Mock } };

  function sel(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      campaignId: 5,
      campaignNameSnapshot: 'Campaña Navidad',
      employeeNameSnapshot: 'Juan Pérez',
      employeeDocumentIdSnapshot: '00100',
      confirmedAt: new Date('2026-01-15T10:00:00Z'),
      status: 'CONFIRMED',
      employee: { phone: '3001234567', shippingAddress: 'Calle 10', shippingCity: 'Bogotá' },
      items: [
        {
          beneficiaryNameSnapshot: 'Ana Pérez',
          beneficiaryAgeSnapshot: 8,
          beneficiaryGenderSnapshot: 'female',
          giftNameSnapshot: 'Muñeca',
          giftReferenceSnapshot: 'MUN-001',
          confirmedAt: new Date('2026-01-15T10:00:00Z'),
        },
      ],
      ...overrides,
    };
  }

  beforeEach(async () => {
    const prismaMock = {
      selection: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SelectionsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(SelectionsService);
    prisma = prismaMock as any;
  });

  describe('workbook structure remains unchanged', () => {
    it('should produce 3 sheets: Resumen Envíos, Detalle Selecciones, Datos Faltantes', async () => {
      prisma.selection.findMany.mockResolvedValue([sel()]);

      const buffer = await service.exportXlsx({});

      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);

      expect(wb.worksheets).toHaveLength(3);
      expect(wb.worksheets[0].name).toBe('Resumen Envíos');
      expect(wb.worksheets[1].name).toBe('Detalle Selecciones');
      expect(wb.worksheets[2].name).toBe('Datos Faltantes');
    });

    it('should have correct headers for Resumen Envíos (13 columns)', async () => {
      prisma.selection.findMany.mockResolvedValue([sel()]);

      const buffer = await service.exportXlsx({});

      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);

      const headers = (wb.worksheets[0].getRow(1).values as string[]).slice(1);
      expect(headers).toEqual([
        'Campaña', 'Empleado', 'ID Empleado', 'Teléfono',
        'Dirección de Envío', 'Ciudad', 'Total Beneficiarios',
        'Total Regalos', 'Beneficiarios', 'Regalos', 'Referencias',
        'Fecha Confirmación', 'Observaciones',
      ]);
    });

    it('should have correct headers for Detalle Selecciones (12 columns)', async () => {
      prisma.selection.findMany.mockResolvedValue([sel()]);

      const buffer = await service.exportXlsx({});

      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);

      const headers = (wb.worksheets[1].getRow(1).values as string[]).slice(1);
      expect(headers).toEqual([
        'Campaña', 'Empleado', 'ID Empleado', 'Teléfono',
        'Dirección de Envío', 'Ciudad', 'Beneficiario', 'Edad',
        'Género', 'Regalo', 'Referencia', 'Fecha Confirmación',
      ]);
    });

    it('should have correct headers for Datos Faltantes (7 columns)', async () => {
      prisma.selection.findMany.mockResolvedValue([sel()]);

      const buffer = await service.exportXlsx({});

      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);

      const headers = (wb.worksheets[2].getRow(1).values as string[]).slice(1);
      expect(headers).toEqual([
        'Campaña', 'Empleado', 'ID Empleado', 'Teléfono',
        'Dirección de Envío', 'Ciudad', 'Datos Faltantes',
      ]);
    });
  });

  describe('scoping', () => {
    it('should apply company scope for COMPANY_VIEWER', async () => {
      prisma.selection.findMany.mockResolvedValue([sel()]);

      await service.exportXlsx({}, { role: 'COMPANY_VIEWER', companyId: 1 });

      const where = prisma.selection.findMany.mock.calls[0][0].where;
      expect((where.campaign as any).companyId).toBe(1);
    });

    it('should NOT apply company scope for SUPER_ADMIN', async () => {
      prisma.selection.findMany.mockResolvedValue([sel()]);

      await service.exportXlsx({}, { role: 'SUPER_ADMIN' });

      const where = prisma.selection.findMany.mock.calls[0][0].where;
      expect((where.campaign as any)?.companyId).toBeUndefined();
    });

    it('should reject COMPANY_VIEWER without companyId', async () => {
      await expect(
        service.exportXlsx({}, { role: 'COMPANY_VIEWER' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should restrict to CONFIRMED status always', async () => {
      prisma.selection.findMany.mockResolvedValue([sel()]);

      await service.exportXlsx({});

      const where = prisma.selection.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('CONFIRMED');
    });
  });

  describe('pagination is not applied', () => {
    it('should not use skip/take', async () => {
      prisma.selection.findMany.mockResolvedValue([sel()]);

      await service.exportXlsx({});

      const args = prisma.selection.findMany.mock.calls[0][0];
      expect(args.skip).toBeUndefined();
      expect(args.take).toBeUndefined();
    });

    it('should export all matching selections when many exist', async () => {
      const manySelections = Array.from({ length: 50 }, (_, i) =>
        sel({ id: i + 1, employeeNameSnapshot: `Employee ${i}` }),
      );
      prisma.selection.findMany.mockResolvedValue(manySelections);

      const buffer = await service.exportXlsx({});

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('filters', () => {
    it('should filter by campaignId', async () => {
      prisma.selection.findMany.mockResolvedValue([sel()]);

      await service.exportXlsx({ campaignId: 10 });

      const where = prisma.selection.findMany.mock.calls[0][0].where;
      expect(where.campaignId).toBe(10);
    });

    it('should filter by date range', async () => {
      prisma.selection.findMany.mockResolvedValue([sel()]);

      await service.exportXlsx({ fromDate: '2026-01-01', toDate: '2026-12-31' });

      const where = prisma.selection.findMany.mock.calls[0][0].where;
      expect(where.confirmedAt).toBeDefined();
    });
  });

  describe('filename behavior', () => {
    it('should produce a valid xlsx buffer', async () => {
      prisma.selection.findMany.mockResolvedValue([sel()]);

      const buffer = await service.exportXlsx({});

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('cross-company data protection', () => {
    it('should prevent COMPANY_VIEWER from exporting another company campaign', async () => {
      prisma.selection.findMany.mockResolvedValue([]);

      await service.exportXlsx(
        { campaignId: 99 },
        { role: 'COMPANY_VIEWER', companyId: 1 },
      );

      const where = prisma.selection.findMany.mock.calls[0][0].where;
      expect((where.campaign as any).companyId).toBe(1);
      expect(where.campaignId).toBe(99);
    });

    it('should allow SUPER_ADMIN to export any campaign', async () => {
      prisma.selection.findMany.mockResolvedValue([sel()]);

      await service.exportXlsx({ campaignId: 99 }, { role: 'SUPER_ADMIN' });

      const where = prisma.selection.findMany.mock.calls[0][0].where;
      expect((where.campaign as any)?.companyId).toBeUndefined();
      expect(where.campaignId).toBe(99);
    });
  });
});

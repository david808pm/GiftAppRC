import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, SelectionStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';

function sanitizeExcelCell(value: unknown): string {
  const str = String(value ?? '');
  if (['=', '+', '-', '@'].includes(str.charAt(0))) {
    return `'${str}`;
  }
  return str;
}

function translateGender(g: string): string {
  if (g === 'male') return 'Masculino';
  if (g === 'female') return 'Femenino';
  return g || '';
}

function formatDateCO(iso: string | Date): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}

function styleHeader(ws: ExcelJS.Worksheet, colCount: number) {
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A5F' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 28;

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: colCount },
  };
}

@Injectable()
export class SelectionsService {
  constructor(private readonly prisma: PrismaService) {}

  private selectionInclude = {
    campaign: { select: { id: true, name: true, slug: true } },
    employee: { select: { id: true, fullName: true, documentId: true } },
    cancelledBy: { select: { id: true, name: true, email: true } },
    items: {
      include: {
        beneficiary: { select: { id: true, fullName: true } },
        gift: { select: { id: true, name: true, reference: true } },
      },
      orderBy: { confirmedAt: 'asc' as const },
    },
  };

  async findAll(
    query: {
      search?: string;
      campaignId?: number;
      employeeId?: number;
      status?: string;
      fromDate?: string;
      toDate?: string;
    },
    user?: { role: string; companyId?: number },
  ) {
    const where: Prisma.SelectionWhereInput = {};

    if (query.campaignId !== undefined) {
      where.campaignId = query.campaignId;
    }
    if (query.employeeId !== undefined) {
      where.employeeId = query.employeeId;
    }
    if (query.status) {
      const validStatuses: SelectionStatus[] = ['CONFIRMED', 'CANCELLED'];
      if (!validStatuses.includes(query.status as SelectionStatus)) {
        throw new BadRequestException(
          `Estado inválido. Valores permitidos: ${validStatuses.join(', ')}.`,
        );
      }
      where.status = query.status as SelectionStatus;
    }
    if (query.fromDate) {
      where.confirmedAt = { ...(where.confirmedAt as any), gte: new Date(query.fromDate) };
    }
    if (query.toDate) {
      where.confirmedAt = { ...(where.confirmedAt as any), lte: new Date(query.toDate) };
    }

    if (query.search) {
      where.OR = [
        { employeeNameSnapshot: { contains: query.search, mode: 'insensitive' } },
        { employeeDocumentIdSnapshot: { contains: query.search, mode: 'insensitive' } },
        { campaignNameSnapshot: { contains: query.search, mode: 'insensitive' } },
        { items: { some: { beneficiaryNameSnapshot: { contains: query.search, mode: 'insensitive' } } } },
        { items: { some: { giftNameSnapshot: { contains: query.search, mode: 'insensitive' } } } },
        { items: { some: { giftReferenceSnapshot: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    // Apply company scoping for COMPANY_VIEWER
    if (user?.role === 'COMPANY_VIEWER') {
      if (!user.companyId) {
        throw new ForbiddenException('No tienes compañía asignada.');
      }
      where.campaign = { companyId: user.companyId };
    }

    return this.prisma.selection.findMany({
      where,
      include: this.selectionInclude,
      orderBy: { confirmedAt: 'desc' },
    });
  }

  async findOne(id: number, user?: { role: string; companyId?: number }) {
    const selection = await this.prisma.selection.findUnique({
      where: { id },
      include: {
        ...this.selectionInclude,
        campaign: { select: { id: true, name: true, slug: true, companyId: true } },
      },
    });

    if (!selection) {
      throw new NotFoundException('Selección no encontrada.');
    }

    // Apply company scoping for COMPANY_VIEWER
    if (user?.role === 'COMPANY_VIEWER') {
      if (!user.companyId) {
        throw new ForbiddenException('No tienes compañía asignada.');
      }
      if (selection.campaign.companyId !== user.companyId) {
        throw new ForbiddenException('No tienes acceso a esta selección.');
      }
    }

    return selection;
  }

  async exportData(
    query: { campaignId?: number; fromDate?: string; toDate?: string },
    user?: { role: string; companyId?: number },
  ) {
    const where: Prisma.SelectionItemWhereInput = {
      selection: { status: 'CONFIRMED' },
    };

    if (query.campaignId !== undefined) {
      where.campaignId = query.campaignId;
    }
    if (query.fromDate) {
      where.confirmedAt = { ...(where.confirmedAt as any), gte: new Date(query.fromDate) };
    }
    if (query.toDate) {
      where.confirmedAt = { ...(where.confirmedAt as any), lte: new Date(query.toDate) };
    }

    // Apply company scoping for COMPANY_VIEWER
    if (user?.role === 'COMPANY_VIEWER') {
      if (!user.companyId) {
        throw new ForbiddenException('No tienes compañía asignada.');
      }
      where.campaign = { companyId: user.companyId };
    }

    const items = await this.prisma.selectionItem.findMany({
      where,
      include: {
        selection: { select: { campaignNameSnapshot: true, employeeNameSnapshot: true, employeeDocumentIdSnapshot: true, confirmedAt: true } },
        employee: { select: { phone: true, shippingAddress: true, shippingCity: true } },
      },
      orderBy: { confirmedAt: 'asc' },
    });

    // TODO: Future — implement CSV file streaming endpoint.

    return items.map((item) => ({
      campaignName: item.selection?.campaignNameSnapshot || '',
      employeeName: item.selection?.employeeNameSnapshot || '',
      employeeDocumentId: item.selection?.employeeDocumentIdSnapshot || '',
      employeePhone: item.employee?.phone || '',
      shippingAddress: item.employee?.shippingAddress || '',
      shippingCity: item.employee?.shippingCity || '',
      beneficiaryName: item.beneficiaryNameSnapshot,
      beneficiaryAge: item.beneficiaryAgeSnapshot,
      beneficiaryGender: item.beneficiaryGenderSnapshot,
      giftName: item.giftNameSnapshot,
      giftReference: item.giftReferenceSnapshot,
      confirmedAt: item.confirmedAt,
    }));
  }

  async exportXlsx(
    query: { campaignId?: number; fromDate?: string; toDate?: string },
    user?: { role: string; companyId?: number },
  ): Promise<Buffer> {
    const where: Prisma.SelectionWhereInput = { status: 'CONFIRMED' };

    if (query.campaignId !== undefined) {
      where.campaignId = query.campaignId;
    }
    if (query.fromDate || query.toDate) {
      const dateFilter: Record<string, Date> = {};
      if (query.fromDate) dateFilter.gte = new Date(query.fromDate);
      if (query.toDate) dateFilter.lte = new Date(query.toDate);
      where.confirmedAt = dateFilter;
    }

    // Apply company scoping for COMPANY_VIEWER
    if (user?.role === 'COMPANY_VIEWER') {
      if (!user.companyId) {
        throw new ForbiddenException('No tienes compañía asignada.');
      }
      where.campaign = { companyId: user.companyId };
    }

    const selections = await this.prisma.selection.findMany({
      where,
      include: {
        employee: { select: { phone: true, shippingAddress: true, shippingCity: true } },
        items: {
          orderBy: { confirmedAt: 'asc' as const },
        },
      },
      orderBy: { confirmedAt: 'desc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'GiftApp';

    // ═══ Sheet 1: Resumen Envíos ═══
    const ws1 = wb.addWorksheet('Resumen Envíos');
    ws1.columns = [
      { header: 'Campaña', key: 'campaign', width: 20 },
      { header: 'Empleado', key: 'employee', width: 28 },
      { header: 'ID Empleado', key: 'docId', width: 18 },
      { header: 'Teléfono', key: 'phone', width: 16 },
      { header: 'Dirección de Envío', key: 'address', width: 30 },
      { header: 'Ciudad', key: 'city', width: 18 },
      { header: 'Total Beneficiarios', key: 'totalBen', width: 16 },
      { header: 'Total Regalos', key: 'totalGifts', width: 14 },
      { header: 'Beneficiarios', key: 'beneficiaries', width: 36 },
      { header: 'Regalos', key: 'gifts', width: 36 },
      { header: 'Referencias', key: 'references', width: 30 },
      { header: 'Fecha Confirmación', key: 'confirmedAt', width: 22 },
      { header: 'Observaciones', key: 'observations', width: 36 },
    ];

    // ═══ Sheet 2: Detalle Selecciones ═══
    const ws2 = wb.addWorksheet('Detalle Selecciones');
    ws2.columns = [
      { header: 'Campaña', key: 'campaign', width: 20 },
      { header: 'Empleado', key: 'employee', width: 28 },
      { header: 'ID Empleado', key: 'docId', width: 18 },
      { header: 'Teléfono', key: 'phone', width: 16 },
      { header: 'Dirección de Envío', key: 'address', width: 30 },
      { header: 'Ciudad', key: 'city', width: 18 },
      { header: 'Beneficiario', key: 'beneficiary', width: 28 },
      { header: 'Edad', key: 'age', width: 8 },
      { header: 'Género', key: 'gender', width: 12 },
      { header: 'Regalo', key: 'gift', width: 28 },
      { header: 'Referencia', key: 'reference', width: 16 },
      { header: 'Fecha Confirmación', key: 'confirmedAt', width: 22 },
    ];

    // ═══ Sheet 3: Datos Faltantes ═══
    const ws3 = wb.addWorksheet('Datos Faltantes');
    ws3.columns = [
      { header: 'Campaña', key: 'campaign', width: 20 },
      { header: 'Empleado', key: 'employee', width: 28 },
      { header: 'ID Empleado', key: 'docId', width: 18 },
      { header: 'Teléfono', key: 'phone', width: 16 },
      { header: 'Dirección de Envío', key: 'address', width: 30 },
      { header: 'Ciudad', key: 'city', width: 18 },
      { header: 'Datos Faltantes', key: 'missing', width: 40 },
    ];

    for (const sel of selections) {
      const phone = sel.employee?.phone || '';
      const address = sel.employee?.shippingAddress || '';
      const city = sel.employee?.shippingCity || '';
      const items = sel.items || [];

      const benNames = items.map((i) => sanitizeExcelCell(i.beneficiaryNameSnapshot)).join(' | ');
      const giftNames = items.map((i) => sanitizeExcelCell(i.giftNameSnapshot)).join(' | ');
      const giftRefs = items.map((i) => sanitizeExcelCell(i.giftReferenceSnapshot)).join(' | ');

      const obsParts: string[] = [];
      if (!phone) obsParts.push('Falta teléfono');
      if (!address) obsParts.push('Falta dirección');
      if (!city) obsParts.push('Falta ciudad');

      ws1.addRow({
        campaign: sanitizeExcelCell(sel.campaignNameSnapshot),
        employee: sanitizeExcelCell(sel.employeeNameSnapshot),
        docId: sanitizeExcelCell(sel.employeeDocumentIdSnapshot),
        phone: sanitizeExcelCell(phone),
        address: sanitizeExcelCell(address),
        city: sanitizeExcelCell(city),
        totalBen: items.length,
        totalGifts: items.length,
        beneficiaries: benNames,
        gifts: giftNames,
        references: giftRefs,
        confirmedAt: formatDateCO(sel.confirmedAt),
        observations: obsParts.join(' | '),
      });

      for (const item of items) {
        ws2.addRow({
          campaign: sanitizeExcelCell(sel.campaignNameSnapshot),
          employee: sanitizeExcelCell(sel.employeeNameSnapshot),
          docId: sanitizeExcelCell(sel.employeeDocumentIdSnapshot),
          phone: sanitizeExcelCell(phone),
          address: sanitizeExcelCell(address),
          city: sanitizeExcelCell(city),
          beneficiary: sanitizeExcelCell(item.beneficiaryNameSnapshot),
          age: item.beneficiaryAgeSnapshot,
          gender: translateGender(item.beneficiaryGenderSnapshot),
          gift: sanitizeExcelCell(item.giftNameSnapshot),
          reference: sanitizeExcelCell(item.giftReferenceSnapshot),
          confirmedAt: formatDateCO(item.confirmedAt),
        });
      }

      if (obsParts.length > 0) {
        ws3.addRow({
          campaign: sanitizeExcelCell(sel.campaignNameSnapshot),
          employee: sanitizeExcelCell(sel.employeeNameSnapshot),
          docId: sanitizeExcelCell(sel.employeeDocumentIdSnapshot),
          phone: sanitizeExcelCell(phone),
          address: sanitizeExcelCell(address),
          city: sanitizeExcelCell(city),
          missing: obsParts.join(' | '),
        });
      }
    }

    styleHeader(ws1, 13);
    styleHeader(ws2, 12);
    styleHeader(ws3, 7);

    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }
}

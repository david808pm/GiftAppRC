import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { Prisma, EmployeeStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';

function sanitizeExcelCell(value: unknown): string {
  const str = String(value ?? '');
  if (['=', '+', '-', '@'].includes(str.charAt(0))) {
    return `'${str}`;
  }
  return str;
}

function translateEmployeeStatus(status: string): string {
  if (status === 'PENDING') return 'Pendiente';
  if (status === 'IN_PROGRESS') return 'En progreso';
  if (status === 'CONFIRMED') return 'Confirmado';
  return status;
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
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Admin: list ──────────────────────────────────────────

  async findAll(query: EmployeeQueryDto, user?: { role: string; companyId?: number }) {
    const { search, campaignId, status, includeDeleted, page, pageSize } = query;

    const where: Prisma.EmployeeWhereInput = {};

    if (includeDeleted !== 'true') {
      where.deletedAt = null;
    }

    if (status) {
      where.status = status;
    }

    if (campaignId !== undefined) {
      where.campaignId = campaignId;
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { documentId: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { shippingCity: { contains: search, mode: 'insensitive' } },
        { shippingAddress: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Apply company scoping for COMPANY_VIEWER
    if (user?.role === 'COMPANY_VIEWER') {
      if (!user.companyId) {
        throw new ForbiddenException('No tienes compañía asignada.');
      }
      where.campaign = { companyId: user.companyId };
    }

    // Hide employees whose parent campaign was soft-deleted.
    if (includeDeleted !== 'true') {
      where.campaign = {
        ...((where.campaign as Prisma.CampaignWhereInput) || {}),
        deletedAt: null,
      };
    }

    const baseInclude = {
      campaign: { select: { id: true, name: true, slug: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
    } as const;

    // Paginated mode — when page and pageSize are provided
    if (page !== undefined && pageSize !== undefined) {
      const [data, total] = await Promise.all([
        this.prisma.employee.findMany({
          where,
          include: baseInclude,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.employee.count({ where }),
      ]);

      return {
        data,
        meta: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    }

    // Backward-compatible mode — returns flat array
    return this.prisma.employee.findMany({
      where,
      include: baseInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Admin: export xlsx ───────────────────────────────────

  async exportXlsx(
    query: { search?: string; campaignId?: number; status?: string },
    user?: { role: string; companyId?: number },
  ): Promise<Buffer> {
    const VALID_STATUSES: EmployeeStatus[] = ['PENDING', 'IN_PROGRESS', 'CONFIRMED'];

    if (query.status && !VALID_STATUSES.includes(query.status as EmployeeStatus)) {
      throw new BadRequestException(
        `Estado de exportación no permitido. Valores permitidos: ${VALID_STATUSES.join(', ')}.`,
      );
    }

    const campaignWhere: Prisma.CampaignWhereInput = { deletedAt: null };

    if (user?.role === 'COMPANY_VIEWER') {
      if (!user.companyId) {
        throw new ForbiddenException('No tienes compañía asignada.');
      }
      campaignWhere.companyId = user.companyId;
    }

    const where: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      campaign: campaignWhere,
    };

    if (query.status) {
      where.status = query.status as EmployeeStatus;
    } else {
      where.status = { in: VALID_STATUSES };
    }

    if (query.campaignId !== undefined) {
      where.campaignId = query.campaignId;
    }

    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { documentId: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { shippingCity: { contains: query.search, mode: 'insensitive' } },
        { shippingAddress: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const employees = await this.prisma.employee.findMany({
      where,
      select: {
        fullName: true,
        documentId: true,
        email: true,
        phone: true,
        shippingAddress: true,
        shippingCity: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        campaign: {
          select: {
            name: true,
            slug: true,
            company: { select: { name: true } },
          },
        },
        _count: { select: { beneficiaries: true } },
      },
      orderBy: [
        { campaign: { company: { name: 'asc' } } },
        { campaign: { name: 'asc' } },
        { fullName: 'asc' },
        { documentId: 'asc' },
      ],
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'GiftApp';

    const ws = wb.addWorksheet('Empleados');
    ws.columns = [
      { header: 'Empresa', key: 'company', width: 22 },
      { header: 'Campaña', key: 'campaign', width: 22 },
      { header: 'Slug de campaña', key: 'campaignSlug', width: 22 },
      { header: 'Documento', key: 'docId', width: 18 },
      { header: 'Nombre completo', key: 'fullName', width: 28 },
      { header: 'Correo electrónico', key: 'email', width: 28 },
      { header: 'Teléfono', key: 'phone', width: 16 },
      { header: 'Dirección de entrega', key: 'address', width: 30 },
      { header: 'Ciudad', key: 'city', width: 18 },
      { header: 'Estado', key: 'status', width: 16 },
      { header: 'Cantidad de beneficiarios', key: 'beneficiaryCount', width: 20 },
      { header: 'Fecha de creación', key: 'createdAt', width: 22 },
      { header: 'Fecha de última actualización', key: 'updatedAt', width: 22 },
    ];

    for (const emp of employees) {
      ws.addRow({
        company: sanitizeExcelCell(emp.campaign?.company?.name ?? ''),
        campaign: sanitizeExcelCell(emp.campaign?.name ?? ''),
        campaignSlug: sanitizeExcelCell(emp.campaign?.slug ?? ''),
        docId: sanitizeExcelCell(emp.documentId),
        fullName: sanitizeExcelCell(emp.fullName),
        email: sanitizeExcelCell(emp.email ?? ''),
        phone: sanitizeExcelCell(emp.phone ?? ''),
        address: sanitizeExcelCell(emp.shippingAddress ?? ''),
        city: sanitizeExcelCell(emp.shippingCity ?? ''),
        status: translateEmployeeStatus(emp.status),
        beneficiaryCount: emp._count?.beneficiaries ?? 0,
        createdAt: formatDateCO(emp.createdAt),
        updatedAt: formatDateCO(emp.updatedAt),
      });
    }

    styleHeader(ws, 13);

    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }

  // ── Admin: get by id ─────────────────────────────────────

  async findOne(id: number, user?: { role: string; companyId?: number }) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        campaign: { select: { id: true, name: true, slug: true, companyId: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!employee || employee.deletedAt) {
      throw new NotFoundException('Empleado no encontrado.');
    }

    // Apply company scoping for COMPANY_VIEWER
    if (user?.role === 'COMPANY_VIEWER') {
      if (!user.companyId) {
        throw new ForbiddenException('No tienes compañía asignada.');
      }
      if (employee.campaign.companyId !== user.companyId) {
        throw new ForbiddenException('No tienes acceso a este empleado.');
      }
    }

    return employee;
  }

  // ── Admin: create ────────────────────────────────────────

  async create(dto: CreateEmployeeDto, adminUserId: number) {
    // CONFIRMED is derived exclusively from the gift-selection flow; it must
    // never be set manually, or the employee would be counted as confirmed
    // without an associated Selection (and could not log in to choose).
    if (dto.status === 'CONFIRMED') {
      throw new BadRequestException(
        'El estado "Confirmado" se asigna automáticamente al confirmar la selección y no puede establecerse manualmente.',
      );
    }

    const documentId = dto.documentId.trim();
    const email = dto.email?.trim().toLowerCase() || null;
    const fullName = dto.fullName.trim();
    const phone = dto.phone?.trim() || null;
    const shippingAddress = dto.shippingAddress?.trim() || null;
    const shippingCity = dto.shippingCity?.trim() || null;

    // Validate campaign exists and is not deleted
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: dto.campaignId },
    });
    if (!campaign || campaign.deletedAt) {
      throw new NotFoundException('La campaña seleccionada no existe.');
    }
    // Only allow assignment to DRAFT or ACTIVE campaigns
    if (campaign.status !== 'DRAFT' && campaign.status !== 'ACTIVE') {
      throw new BadRequestException(
        'No se pueden asignar empleados a campañas cerradas, pausadas o archivadas.',
      );
    }

    // Validate documentId uniqueness within campaign
    const existing = await this.prisma.employee.findUnique({
      where: {
        campaignId_documentId: {
          campaignId: dto.campaignId,
          documentId,
        },
      },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException(
        'Ya existe un empleado con ese documento en esta campaña.',
      );
    }
    // If soft-deleted, allow re-creation by restoring
    if (existing && existing.deletedAt) {
      // TODO: AuditLog — log employee restore when AuditLog module is implemented.
      return this.prisma.employee.update({
        where: { id: existing.id },
        data: {
          fullName,
          email,
          phone,
          shippingAddress,
          shippingCity,
          status: dto.status || 'PENDING',
          deletedAt: null,
          createdById: adminUserId,
          updatedById: adminUserId,
          confirmedAt: null,
        },
        include: {
          campaign: { select: { id: true, name: true, slug: true } },
        },
      });
    }

    // TODO: AuditLog — log employee creation when AuditLog module is implemented.

    return this.prisma.employee.create({
      data: {
        campaignId: dto.campaignId,
        fullName,
        documentId,
        email,
        phone,
        shippingAddress,
        shippingCity,
        status: dto.status || 'PENDING',
        confirmedAt: null,
        createdById: adminUserId,
      },
      include: {
        campaign: { select: { id: true, name: true, slug: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  // ── Admin: update ────────────────────────────────────────

  async update(id: number, dto: UpdateEmployeeDto, adminUserId: number) {
    const employee = await this.findOne(id);

    const data: Prisma.EmployeeUpdateInput = {};

    // fullName
    if (dto.fullName !== undefined) {
      data.fullName = dto.fullName.trim();
    }

    // email
    if (dto.email !== undefined) {
      data.email = dto.email ? dto.email.trim().toLowerCase() : null;
    }

    // phone
    if (dto.phone !== undefined) {
      data.phone = dto.phone ? dto.phone.trim() : null;
    }

    // shippingAddress
    if (dto.shippingAddress !== undefined) {
      data.shippingAddress = dto.shippingAddress ? dto.shippingAddress.trim() : null;
    }

    // shippingCity
    if (dto.shippingCity !== undefined) {
      data.shippingCity = dto.shippingCity ? dto.shippingCity.trim() : null;
    }

    // campaignId — block if CONFIRMED
    if (dto.campaignId !== undefined) {
      if (employee.status === 'CONFIRMED' && dto.campaignId !== employee.campaignId) {
        throw new ForbiddenException(
          'No se puede cambiar la campaña de un empleado con selección confirmada.',
        );
      }
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: dto.campaignId },
      });
      if (!campaign || campaign.deletedAt) {
        throw new NotFoundException('La campaña seleccionada no existe.');
      }
      // Only allow assignment to DRAFT or ACTIVE campaigns
      if (campaign.status !== 'DRAFT' && campaign.status !== 'ACTIVE') {
        throw new BadRequestException(
          'No se pueden asignar empleados a campañas cerradas, pausadas o archivadas.',
        );
      }
      data.campaign = { connect: { id: dto.campaignId } };
    }

    // documentId — block if CONFIRMED
    if (dto.documentId !== undefined) {
      if (employee.status === 'CONFIRMED') {
        throw new ForbiddenException(
          'No se puede cambiar el documento de un empleado con selección confirmada.',
        );
      }
      const newDocId = dto.documentId.trim();
      const campaignId = dto.campaignId ?? employee.campaignId;
      const existing = await this.prisma.employee.findUnique({
        where: {
          campaignId_documentId: {
            campaignId,
            documentId: newDocId,
          },
        },
      });
      if (existing && existing.id !== id && !existing.deletedAt) {
        throw new ConflictException(
          'Ya existe un empleado con ese documento en la campaña.',
        );
      }
      data.documentId = newDocId;
    }

    // status — block manual transition INTO CONFIRMED (only the selection flow
    // may confirm). Already-confirmed employees keep their status so other
    // fields can still be edited.
    if (dto.status !== undefined) {
      if (dto.status === 'CONFIRMED' && employee.status !== 'CONFIRMED') {
        throw new BadRequestException(
          'El estado "Confirmado" se asigna automáticamente al confirmar la selección y no puede establecerse manualmente.',
        );
      }
      data.status = dto.status;
    }

    data.updatedBy = { connect: { id: adminUserId } };

    // TODO: AuditLog — log employee update when AuditLog module is implemented.

    return this.prisma.employee.update({
      where: { id },
      data,
      include: {
        campaign: { select: { id: true, name: true, slug: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  // ── Admin: soft delete ───────────────────────────────────

  async remove(id: number) {
    const employee = await this.findOne(id);

    if (employee.status === 'CONFIRMED') {
      throw new ForbiddenException(
        'No se puede eliminar un empleado con selección confirmada.',
      );
    }

    // TODO: Check for beneficiaries when Beneficiary model exists.
    // TODO: Check for selections when Selection model exists.
    // TODO: AuditLog — log employee deletion when AuditLog module is implemented.

    return this.prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'BLOCKED' },
    });
  }
}

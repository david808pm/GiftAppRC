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
import { Prisma } from '@prisma/client';

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

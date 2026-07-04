import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { BeneficiaryQueryDto } from './dto/beneficiary-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class BeneficiariesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Admin: list ──────────────────────────────────────────

  async findAll(query: BeneficiaryQueryDto, user?: { role: string; companyId?: number }) {
    const { search, employeeId, campaignId, gender, includeDeleted, page, pageSize } = query;

    const where: Prisma.BeneficiaryWhereInput = {};

    if (includeDeleted !== 'true') {
      where.deletedAt = null;
    }

    if (employeeId !== undefined) {
      where.employeeId = employeeId;
    }

    if (gender) {
      where.gender = gender;
    }

    if (campaignId !== undefined) {
      where.employee = { campaignId, deletedAt: null };
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { employee: { fullName: { contains: search, mode: 'insensitive' } } },
        { employee: { documentId: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Apply company scoping for COMPANY_VIEWER
    if (user?.role === 'COMPANY_VIEWER') {
      if (!user.companyId) {
        throw new ForbiddenException('No tienes compañía asignada.');
      }
      where.employee = {
        ...((where.employee as Prisma.EmployeeWhereInput) || {}),
        campaign: { companyId: user.companyId },
      };
    }

    // Hide beneficiaries whose parent employee or campaign was soft-deleted.
    if (includeDeleted !== 'true') {
      const existingEmployee = (where.employee as Prisma.EmployeeWhereInput) || {};
      where.employee = {
        ...existingEmployee,
        deletedAt: null,
        campaign: {
          ...((existingEmployee.campaign as Prisma.CampaignWhereInput) || {}),
          deletedAt: null,
        },
      };
    }

    const baseInclude = {
      employee: {
        select: {
          id: true,
          fullName: true,
          documentId: true,
          campaignId: true,
          campaign: { select: { id: true, name: true, slug: true } },
        },
      },
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
    } as const;

    // Paginated mode — when page and pageSize are provided
    if (page !== undefined && pageSize !== undefined) {
      const [data, total] = await Promise.all([
        this.prisma.beneficiary.findMany({
          where,
          include: baseInclude,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.beneficiary.count({ where }),
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
    return this.prisma.beneficiary.findMany({
      where,
      include: baseInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Admin: get by id ─────────────────────────────────────

  async findOne(id: number, user?: { role: string; companyId?: number }) {
    const beneficiary = await this.prisma.beneficiary.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            documentId: true,
            campaignId: true,
            status: true,
            campaign: { select: { id: true, name: true, slug: true, companyId: true } },
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!beneficiary || beneficiary.deletedAt) {
      throw new NotFoundException('Beneficiario no encontrado.');
    }

    // Apply company scoping for COMPANY_VIEWER
    if (user?.role === 'COMPANY_VIEWER') {
      if (!user.companyId) {
        throw new ForbiddenException('No tienes compañía asignada.');
      }
      if (beneficiary.employee.campaign.companyId !== user.companyId) {
        throw new ForbiddenException('No tienes acceso a este beneficiario.');
      }
    }

    return beneficiary;
  }

  // ── Admin: create ────────────────────────────────────────

  async create(dto: CreateBeneficiaryDto, adminUserId: number) {
    const fullName = dto.fullName.trim();

    // Validate employee exists and is not deleted
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
    });
    if (!employee || employee.deletedAt) {
      throw new NotFoundException('El empleado seleccionado no existe.');
    }
    // A confirmed employee already has a selection; a new beneficiary would be
    // left without a SelectionItem, breaking the one-gift-per-beneficiary rule.
    if (employee.status === 'CONFIRMED') {
      throw new ForbiddenException(
        'No se pueden agregar beneficiarios a un empleado con selección confirmada.',
      );
    }

    // TODO: AuditLog — log beneficiary creation when AuditLog module is implemented.

    return this.prisma.beneficiary.create({
      data: {
        employeeId: dto.employeeId,
        fullName,
        age: dto.age,
        gender: dto.gender,
        createdById: adminUserId,
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            documentId: true,
            campaign: { select: { id: true, name: true, slug: true } },
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  // ── Admin: update ────────────────────────────────────────

  async update(id: number, dto: UpdateBeneficiaryDto, adminUserId: number) {
    const beneficiary = await this.findOne(id);
    const parentEmployee = beneficiary.employee;
    const isConfirmed = parentEmployee?.status === 'CONFIRMED';

    const data: Prisma.BeneficiaryUpdateInput = {};

    // fullName — allowed even if CONFIRMED? Per spec: "Allow changing fullName only if employee is not CONFIRMED"
    if (dto.fullName !== undefined) {
      if (isConfirmed) {
        throw new ForbiddenException(
          'No se puede modificar beneficiarios de un empleado con selección confirmada.',
        );
      }
      data.fullName = dto.fullName.trim();
    }

    // employeeId — block if CONFIRMED
    if (dto.employeeId !== undefined) {
      if (isConfirmed) {
        throw new ForbiddenException(
          'No se puede cambiar el empleado de un beneficiario con selección confirmada.',
        );
      }
      const employee = await this.prisma.employee.findUnique({
        where: { id: dto.employeeId },
      });
      if (!employee || employee.deletedAt) {
        throw new NotFoundException('El empleado seleccionado no existe.');
      }
      // Cannot move a beneficiary onto an already-confirmed employee either.
      if (employee.status === 'CONFIRMED') {
        throw new ForbiddenException(
          'No se puede asignar el beneficiario a un empleado con selección confirmada.',
        );
      }
      data.employee = { connect: { id: dto.employeeId } };
    }

    // age — block if CONFIRMED
    if (dto.age !== undefined) {
      if (isConfirmed) {
        throw new ForbiddenException(
          'No se puede modificar la edad de un beneficiario con selección confirmada.',
        );
      }
      data.age = dto.age;
    }

    // gender — block if CONFIRMED
    if (dto.gender !== undefined) {
      if (isConfirmed) {
        throw new ForbiddenException(
          'No se puede modificar el género de un beneficiario con selección confirmada.',
        );
      }
      data.gender = dto.gender;
    }

    data.updatedBy = { connect: { id: adminUserId } };

    // TODO: AuditLog — log beneficiary update when AuditLog module is implemented.

    return this.prisma.beneficiary.update({
      where: { id },
      data,
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            documentId: true,
            campaign: { select: { id: true, name: true, slug: true } },
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  // ── Admin: soft delete ───────────────────────────────────

  async remove(id: number) {
    const beneficiary = await this.findOne(id);

    // Block delete if parent employee is CONFIRMED
    const employee = await this.prisma.employee.findUnique({
      where: { id: beneficiary.employeeId },
    });
    if (employee && employee.status === 'CONFIRMED') {
      throw new ForbiddenException(
        'No se puede eliminar un beneficiario de un empleado con selección confirmada.',
      );
    }

    // TODO: Check for selections when Selection model exists.
    // TODO: AuditLog — log beneficiary deletion when AuditLog module is implemented.

    return this.prisma.beneficiary.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.adminUser.findMany({
      omit: { password: true },
      include: {
        role: { select: { id: true, name: true } },
        company: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const user = await this.prisma.adminUser.findUnique({
      where: { id },
      omit: { password: true },
      include: {
        role: { select: { id: true, name: true } },
        company: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    return user;
  }

  async create(dto: CreateAdminUserDto) {
    // Validate companyId exists and is active
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });

    if (!company || !company.isActive) {
      throw new BadRequestException('La compañía no existe o está inactiva.');
    }

    // Check email uniqueness
    const existing = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese correo.');
    }

    // Get role
    const role = await this.prisma.role.findUnique({
      where: { name: dto.role },
    });

    if (!role) {
      throw new BadRequestException('El rol especificado no existe.');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 12);

    return this.prisma.adminUser.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
        roleId: role.id,
        companyId: dto.companyId,
        isActive: dto.isActive ?? true,
      },
      omit: { password: true },
      include: {
        role: { select: { id: true, name: true } },
        company: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async update(id: number, dto: UpdateAdminUserDto) {
    const user = await this.findOne(id);

    // Prevent changing role to SUPER_ADMIN
    if (dto.role && dto.role !== 'COMPANY_VIEWER') {
      throw new BadRequestException('Solo se permite el rol COMPANY_VIEWER.');
    }

    const updateData: any = {};

    if (dto.name) updateData.name = dto.name;
    if (dto.email) {
      // Check email uniqueness
      const existing = await this.prisma.adminUser.findUnique({
        where: { email: dto.email },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Ya existe un usuario con ese correo.');
      }
      updateData.email = dto.email;
    }
    if (dto.role) {
      const role = await this.prisma.role.findUnique({
        where: { name: dto.role },
      });
      if (role) updateData.roleId = role.id;
    }
    if (dto.companyId !== undefined) {
      const company = await this.prisma.company.findUnique({
        where: { id: dto.companyId },
      });
      if (!company || !company.isActive) {
        throw new BadRequestException('La compañía no existe o está inactiva.');
      }
      updateData.companyId = dto.companyId;
    }
    if (dto.isActive !== undefined) {
      updateData.isActive = dto.isActive;
    }

    return this.prisma.adminUser.update({
      where: { id },
      data: updateData,
      omit: { password: true },
      include: {
        role: { select: { id: true, name: true } },
        company: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async changePassword(id: number, dto: ChangePasswordDto) {
    const user = await this.findOne(id);

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    return this.prisma.adminUser.update({
      where: { id },
      data: { password: hashedPassword },
      omit: { password: true },
      include: {
        role: { select: { id: true, name: true } },
        company: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async updateStatus(id: number, dto: UpdateStatusDto) {
    const user = await this.findOne(id);

    return this.prisma.adminUser.update({
      where: { id },
      data: { isActive: dto.isActive },
      omit: { password: true },
      include: {
        role: { select: { id: true, name: true } },
        company: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async remove(targetUserId: number, authenticatedUserId: number) {
    if (targetUserId === authenticatedUserId) {
      throw new ForbiddenException('No puedes eliminar tu propio usuario.');
    }

    const target = await this.prisma.adminUser.findUnique({
      where: { id: targetUserId },
      include: { role: { select: { name: true } } },
    });

    if (!target) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const result = await this.prisma.adminUser.deleteMany({
      where: {
        id: targetUserId,
        role: { name: 'COMPANY_VIEWER' },
      },
    });

    if (result.count !== 1) {
      throw new ForbiddenException(
        'Solo se pueden eliminar usuarios con rol COMPANY_VIEWER.',
      );
    }

    return {
      success: true,
      message: 'Usuario eliminado correctamente.',
    };
  }
}

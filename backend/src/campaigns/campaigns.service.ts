import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';
import { Prisma } from '@prisma/client';
import { CompaniesService } from '../companies/companies.service';
import { SupabaseStorageService } from '../common/services/supabase-storage.service';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  // ── Admin: list ──────────────────────────────────────────

  async findAll(query: QueryCampaignsDto, user?: { role: string; companyId?: number }) {
    const { search, status, includeDeleted } = query;

    const where: Prisma.CampaignWhereInput = {};

    if (includeDeleted !== 'true') {
      where.deletedAt = null;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Company scoping for COMPANY_VIEWER
    if (user?.role === 'COMPANY_VIEWER') {
      if (!user.companyId) {
        throw new ForbiddenException('No tienes compañía asignada.');
      }
      where.companyId = user.companyId;
    }

    return this.prisma.campaign.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        welcomeText: true,
        rulesText: true,
        status: true,
        logoText: true,
        primaryColor: true,
        logoImageUrl: true,
        bannerImageUrl: true,
        bannerDecoration: true,
        companyId: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        company: { select: { id: true, name: true, slug: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Admin: get by id ─────────────────────────────────────

  async findOne(id: number, user?: { role: string; companyId?: number }) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        welcomeText: true,
        rulesText: true,
        status: true,
        logoText: true,
        primaryColor: true,
        logoImageUrl: true,
        bannerImageUrl: true,
        bannerDecoration: true,
        companyId: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        company: { select: { id: true, name: true, slug: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!campaign || campaign.deletedAt) {
      throw new NotFoundException('Campaña no encontrada.');
    }

    // Company scoping for COMPANY_VIEWER
    if (user?.role === 'COMPANY_VIEWER') {
      if (!user.companyId) {
        throw new ForbiddenException('No tienes compañía asignada.');
      }
      if (campaign.companyId !== user.companyId) {
        throw new ForbiddenException('No tienes acceso a esta campaña.');
      }
    }

    return campaign;
  }

  // ── Admin: create ────────────────────────────────────────

  async create(dto: CreateCampaignDto, adminUserId: number) {
    // Generate slug if not provided
    let slug = dto.slug?.trim().toLowerCase();
    if (!slug) {
      // Get company to build slug from company slug + campaign name
      const company = await this.prisma.company.findUnique({
        where: { id: dto.companyId },
      });
      if (!company) {
        throw new NotFoundException('La empresa seleccionada no existe.');
      }
      const campaignSlugPart = CompaniesService.generateSlug(dto.name);
      slug = campaignSlugPart.startsWith(`${company.slug}-`)
        ? campaignSlugPart
        : `${company.slug}-${campaignSlugPart}`;
    }

    // Check slug uniqueness (including soft-deleted)
    const existing = await this.prisma.campaign.findUnique({
      where: { slug },
    });
    if (existing) {
      throw new ConflictException('Ya existe una campaña con ese slug.');
    }

    // Validate date window ordering
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (startsAt && endsAt && startsAt >= endsAt) {
      throw new BadRequestException(
        'La fecha de inicio debe ser anterior a la fecha de fin.',
      );
    }

    // TODO: AuditLog — log campaign creation when AuditLog module is implemented.

    return this.prisma.campaign.create({
      data: {
        name: dto.name.trim(),
        slug,
        companyId: dto.companyId,
        welcomeText: dto.welcomeText?.trim(),
        rulesText: dto.rulesText?.trim(),
        status: dto.status || 'ACTIVE',
        logoText: dto.logoText?.trim(),
        primaryColor: dto.primaryColor?.trim(),
        logoImageUrl: dto.logoImageUrl?.trim(),
        ...(dto.bannerImageUrl !== undefined
          ? { bannerImageUrl: dto.bannerImageUrl?.trim() }
          : {}),
        ...(dto.bannerDecoration !== undefined
          ? { bannerDecoration: dto.bannerDecoration }
          : {}),
        startsAt,
        endsAt,
        createdById: adminUserId,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        company: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  // ── Admin: update ────────────────────────────────────────

  async update(id: number, dto: UpdateCampaignDto, adminUserId: number) {
    const campaign = await this.findOne(id);

    const data: Prisma.CampaignUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.welcomeText !== undefined) data.welcomeText = dto.welcomeText?.trim();
    if (dto.rulesText !== undefined) data.rulesText = dto.rulesText?.trim();
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.logoText !== undefined) data.logoText = dto.logoText?.trim();
    if (dto.primaryColor !== undefined) data.primaryColor = dto.primaryColor?.trim();
    if (dto.logoImageUrl !== undefined) data.logoImageUrl = dto.logoImageUrl?.trim();
    if (dto.bannerImageUrl !== undefined) data.bannerImageUrl = dto.bannerImageUrl?.trim();
    if (dto.bannerDecoration !== undefined) data.bannerDecoration = dto.bannerDecoration;
    if (dto.startsAt !== undefined) data.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    if (dto.endsAt !== undefined) data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;

    // Validate date window ordering using the resulting (final) values.
    const finalStartsAt =
      dto.startsAt !== undefined
        ? dto.startsAt
          ? new Date(dto.startsAt)
          : null
        : campaign.startsAt;
    const finalEndsAt =
      dto.endsAt !== undefined
        ? dto.endsAt
          ? new Date(dto.endsAt)
          : null
        : campaign.endsAt;
    if (finalStartsAt && finalEndsAt && finalStartsAt >= finalEndsAt) {
      throw new BadRequestException(
        'La fecha de inicio debe ser anterior a la fecha de fin.',
      );
    }

    if (dto.slug !== undefined) {
      const slug = dto.slug.trim().toLowerCase();
      if (slug !== campaign.slug) {
        const existing = await this.prisma.campaign.findUnique({
          where: { slug },
        });
        if (existing) {
          throw new ConflictException('Ya existe una campaña con ese slug.');
        }
        data.slug = slug;
      }
    }

    data.updatedBy = { connect: { id: adminUserId } };

    // TODO: AuditLog — log campaign update when AuditLog module is implemented.

    return await this.prisma.campaign.update({
      where: { id },
      data,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  // ── Admin: upload logo ───────────────────────────────────

  async uploadLogo(id: number, file: Express.Multer.File): Promise<{ logoImageUrl: string }> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: { company: { select: { id: true } } },
    });

    if (!campaign || campaign.deletedAt) {
      throw new NotFoundException('Campaña no encontrada.');
    }

    const ext = SupabaseStorageService.sanitizeExtension(file.mimetype);
    const uuid = crypto.randomUUID();
    const companyId = campaign.companyId ?? 'unknown';
    const storagePath = `company-${companyId}/campaign-${id}/${uuid}${ext}`;

    const logoImageUrl = await this.storage.uploadFile(
      file.buffer,
      storagePath,
      file.mimetype,
      'campaign-logos',
    );

    await this.prisma.campaign.update({
      where: { id },
      data: { logoImageUrl },
    });

    return { logoImageUrl };
  }

  async uploadBanner(id: number, file: Express.Multer.File): Promise<{ bannerImageUrl: string }> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: { company: { select: { id: true } } },
    });

    if (!campaign || campaign.deletedAt) {
      throw new NotFoundException('Campaña no encontrada.');
    }

    const ext = SupabaseStorageService.sanitizeExtension(file.mimetype);
    const uuid = crypto.randomUUID();
    const companyId = campaign.companyId ?? 'unknown';
    const storagePath = `company-${companyId}/campaign-${id}/banner-${uuid}${ext}`;

    const bannerImageUrl = await this.storage.uploadFile(
      file.buffer,
      storagePath,
      file.mimetype,
      'campaign-logos',
    );

    try {
      await this.prisma.campaign.update({
        where: { id },
        data: { bannerImageUrl },
      });
    } catch (err) {
      // Best-effort cleanup: remove the newly uploaded object so no orphan
      // file is left in Storage. The prior campaign state is preserved
      // because the update never succeeded.
      await this.storage.deleteFile(storagePath, 'campaign-logos');
      throw err;
    }

    return { bannerImageUrl };
  }

  // ── Admin: soft delete ───────────────────────────────────

  async remove(id: number) {
    await this.findOne(id);

    // TODO: AuditLog — log campaign deletion when AuditLog module is implemented.
    // TODO: Check for dependent employees, gifts, selections before soft-deleting.

    return this.prisma.campaign.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'CLOSED' },
    });
  }

  // ── Public: get by slug ──────────────────────────────────

  async findBySlug(slug: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { slug: slug.trim().toLowerCase() },
    });

    if (!campaign || campaign.deletedAt) {
      throw new NotFoundException('Campaña no encontrada.');
    }

    // Return safe public fields only. `otpEnabled` is derived from the
    // backend feature flag PUBLIC_LOGIN_OTP_ENABLED so the frontend can
    // decide which login flow to render. No secrets are exposed.
    const otpEnabled = (process.env.PUBLIC_LOGIN_OTP_ENABLED === 'true');

    return {
      id: campaign.id,
      name: campaign.name,
      slug: campaign.slug,
      welcomeText: campaign.welcomeText,
      rulesText: campaign.rulesText,
      status: campaign.status,
      logoText: campaign.logoText,
      primaryColor: campaign.primaryColor,
      logoImageUrl: campaign.logoImageUrl,
      bannerImageUrl: campaign.bannerImageUrl,
      bannerDecoration: campaign.bannerDecoration,
      otpEnabled,
    };
  }
}

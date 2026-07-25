import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGiftDto } from './dto/create-gift.dto';
import { UpdateGiftDto } from './dto/update-gift.dto';
import { GiftQueryDto } from './dto/gift-query.dto';
import { SupabaseStorageService } from '../common/services/supabase-storage.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class GiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  // ── Helpers ──────────────────────────────────────────────

  private giftInclude = {
    campaign: { select: { id: true, name: true, slug: true } },
    images: { orderBy: { sortOrder: 'asc' as const } },
    createdBy: { select: { id: true, name: true, email: true } },
    updatedBy: { select: { id: true, name: true, email: true } },
  };

  private async syncImages(
    tx: Prisma.TransactionClient,
    giftId: number,
    imageUrls: string[] | undefined,
  ) {
    if (imageUrls === undefined || imageUrls.length === 0) return;

    // Delete existing images and re-insert atomically (within the caller's tx).
    await tx.giftImage.deleteMany({ where: { giftId } });

    const imageRecords = imageUrls.map((url, i) => ({
      giftId,
      imageUrl: url.trim(),
      sortOrder: i,
      isPrimary: i === 0,
    }));

    await tx.giftImage.createMany({ data: imageRecords });
  }

  private async validateCampaign(campaignId: number) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign || campaign.deletedAt) {
      throw new NotFoundException('La campaña seleccionada no existe.');
    }
    return campaign;
  }

  // ── Admin: list ──────────────────────────────────────────

  async findAll(query: GiftQueryDto, user?: { role: string; companyId?: number }) {
    const {
      search,
      campaignId,
      status,
      allowedGender,
      minAge,
      maxAge,
      includeDeleted,
    } = query;

    const where: Prisma.GiftWhereInput = {};

    if (includeDeleted !== 'true') {
      where.deletedAt = null;
    }

    if (campaignId !== undefined) {
      where.campaignId = campaignId;
    }

    if (status) {
      where.status = status;
    }

    if (allowedGender) {
      where.allowedGender = allowedGender;
    }

    if (minAge !== undefined || maxAge !== undefined) {
      where.AND = [];
      if (minAge !== undefined) {
        (where.AND as Prisma.GiftWhereInput[]).push({ maxAge: { gte: minAge } });
      }
      if (maxAge !== undefined) {
        (where.AND as Prisma.GiftWhereInput[]).push({ minAge: { lte: maxAge } });
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        { campaign: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Apply company scoping for COMPANY_VIEWER
    if (user?.role === 'COMPANY_VIEWER') {
      if (!user.companyId) {
        throw new ForbiddenException('No tienes compañía asignada.');
      }
      where.campaign = { companyId: user.companyId };
    }

    // Hide gifts whose parent campaign was soft-deleted.
    if (includeDeleted !== 'true') {
      where.campaign = {
        ...((where.campaign as Prisma.CampaignWhereInput) || {}),
        deletedAt: null,
      };
    }

    return this.prisma.gift.findMany({
      where,
      include: this.giftInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Admin: get by id ─────────────────────────────────────

  async findOne(id: number, user?: { role: string; companyId?: number }) {
    const gift = await this.prisma.gift.findUnique({
      where: { id },
      include: {
        ...this.giftInclude,
        campaign: { select: { id: true, name: true, slug: true, companyId: true } },
      },
    });

    if (!gift || gift.deletedAt) {
      throw new NotFoundException('Regalo no encontrado.');
    }

    // Apply company scoping for COMPANY_VIEWER
    if (user?.role === 'COMPANY_VIEWER') {
      if (!user.companyId) {
        throw new ForbiddenException('No tienes compañía asignada.');
      }
      if (gift.campaign.companyId !== user.companyId) {
        throw new ForbiddenException('No tienes acceso a este regalo.');
      }
    }

    return gift;
  }

  // ── Admin: create ────────────────────────────────────────

  async create(dto: CreateGiftDto, adminUserId: number) {
    await this.validateCampaign(dto.campaignId);

    const reference = dto.reference.trim().toUpperCase();
    const minAge = dto.minAge ?? 0;
    const maxAge = dto.maxAge ?? 13;

    // Validate minAge <= maxAge
    if (minAge > maxAge) {
      throw new BadRequestException(
        'La edad mínima debe ser menor o igual a la edad máxima.',
      );
    }

    // Validate reference uniqueness within campaign
    const existing = await this.prisma.gift.findUnique({
      where: {
        campaignId_reference: {
          campaignId: dto.campaignId,
          reference,
        },
      },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException(
        'Ya existe un regalo con esa referencia en esta campaña.',
      );
    }
    // If soft-deleted, restore
    if (existing && existing.deletedAt) {
      await this.prisma.$transaction(async (tx) => {
        const restoreData: Prisma.GiftUpdateInput = {
          name: dto.name.trim(),
          shortDescription: dto.shortDescription?.trim(),
          technicalDescription: dto.technicalDescription?.trim(),
          dimensions: dto.dimensions?.trim(),
          minAge,
          maxAge,
          allowedGender: dto.allowedGender ?? 'all',
          status: dto.status ?? 'ACTIVE',
          deletedAt: null,
          updatedBy: { connect: { id: adminUserId } },
        };

        if (dto.stock !== undefined) {
          restoreData.stock = dto.stock;
        }

        await tx.gift.update({
          where: { id: existing.id },
          data: restoreData,
        });

        if (dto.stock !== undefined && dto.stock !== existing.stock) {
          await tx.stockMovement.create({
            data: {
              giftId: existing.id,
              campaignId: dto.campaignId,
              movementType: 'CORRECTION',
              quantityChange: dto.stock - existing.stock,
              previousStock: existing.stock,
              newStock: dto.stock,
              reason: 'Restauración de regalo eliminado',
              createdById: adminUserId,
            },
          });
        }

        await this.syncImages(tx, existing.id, dto.imageUrls);
      });
      // TODO: AuditLog — log gift restore when AuditLog module is implemented.
      return this.findOne(existing.id);
    }

    const giftId = await this.prisma.$transaction(async (tx) => {
      const gift = await tx.gift.create({
        data: {
          campaignId: dto.campaignId,
          name: dto.name.trim(),
          reference,
          shortDescription: dto.shortDescription?.trim(),
          technicalDescription: dto.technicalDescription?.trim(),
          dimensions: dto.dimensions?.trim(),
          stock: dto.stock ?? 0,
          minAge,
          maxAge,
          allowedGender: dto.allowedGender ?? 'all',
          status: dto.status ?? 'ACTIVE',
          createdById: adminUserId,
        },
      });
      await this.syncImages(tx, gift.id, dto.imageUrls);
      return gift.id;
    });

    // TODO: AuditLog — log gift creation when AuditLog module is implemented.

    return this.findOne(giftId);
  }

  // ── Admin: update ────────────────────────────────────────

  async update(id: number, dto: UpdateGiftDto, adminUserId: number) {
    const gift = await this.findOne(id);

    const data: Prisma.GiftUpdateInput = {};

    // campaignId
    if (dto.campaignId !== undefined) {
      // TODO: When Selection model exists, block campaignId change if gift has selections.
      await this.validateCampaign(dto.campaignId);
      data.campaign = { connect: { id: dto.campaignId } };
    }

    // reference
    const campaignId = dto.campaignId ?? gift.campaignId;
    if (dto.reference !== undefined) {
      const reference = dto.reference.trim().toUpperCase();
      if (reference !== gift.reference) {
        const existing = await this.prisma.gift.findUnique({
          where: { campaignId_reference: { campaignId, reference } },
        });
        if (existing && existing.id !== id && !existing.deletedAt) {
          throw new ConflictException(
            'Ya existe un regalo con esa referencia en la campaña.',
          );
        }
        data.reference = reference;
      }
    }

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.shortDescription !== undefined) data.shortDescription = dto.shortDescription?.trim();
    if (dto.technicalDescription !== undefined) data.technicalDescription = dto.technicalDescription?.trim();
    if (dto.dimensions !== undefined) data.dimensions = dto.dimensions?.trim();
    if (dto.stock !== undefined) data.stock = dto.stock;
    if (dto.minAge !== undefined) data.minAge = dto.minAge;
    if (dto.maxAge !== undefined) data.maxAge = dto.maxAge;
    if (dto.allowedGender !== undefined) data.allowedGender = dto.allowedGender;
    if (dto.status !== undefined) data.status = dto.status;

    // Validate minAge <= maxAge after potential updates
    const finalMinAge = dto.minAge ?? gift.minAge;
    const finalMaxAge = dto.maxAge ?? gift.maxAge;
    if (finalMinAge > finalMaxAge) {
      throw new BadRequestException(
        'La edad mínima debe ser menor o igual a la edad máxima.',
      );
    }

    data.updatedBy = { connect: { id: adminUserId } };

    // Apply the update, stock-movement audit and image sync atomically.
    await this.prisma.$transaction(async (tx) => {
      await tx.gift.update({ where: { id }, data });

      // Record a stock movement whenever stock is explicitly changed.
      if (dto.stock !== undefined && dto.stock !== gift.stock) {
        await tx.stockMovement.create({
          data: {
            giftId: id,
            campaignId,
            movementType: 'ADMIN_ADJUSTMENT',
            quantityChange: dto.stock - gift.stock,
            previousStock: gift.stock,
            newStock: dto.stock,
            reason: 'Ajuste manual de stock',
            createdById: adminUserId,
          },
        });
      }

      // Sync images only if imageUrls is explicitly provided.
      if (dto.imageUrls !== undefined) {
        await this.syncImages(tx, id, dto.imageUrls);
      }
    });

    // TODO: AuditLog — log gift update when AuditLog module is implemented.

    return this.findOne(id);
  }

  // ── Admin: soft delete ───────────────────────────────────

  async remove(id: number) {
    await this.findOne(id);

    // TODO: Check for selections when Selection model exists.
    // TODO: AuditLog — log gift deletion when AuditLog module is implemented.

    return this.prisma.gift.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
      include: this.giftInclude,
    });
  }

  // ── Admin: upload images ────────────────────────────────

  async uploadImages(
    giftId: number,
    files: Express.Multer.File[],
    adminUserId: number,
  ) {
    const gift = await this.findOne(giftId);
    const campaignId = gift.campaignId;

    if (!files || files.length === 0) {
      return this.findOne(giftId);
    }

    const existingCount = await this.prisma.giftImage.count({
      where: { giftId },
    });

    const remainingSlots = 3 - existingCount;

    if (files.length > remainingSlots) {
      throw new BadRequestException(
        'Un regalo puede tener máximo 3 imágenes.',
      );
    }

    for (const file of files) {
      SupabaseStorageService.validateMimeType(file.mimetype);
      SupabaseStorageService.validateFileSize(file.size);
    }

    const uploadResults = await Promise.allSettled(
      files.map(async (file) => {
        const ext = SupabaseStorageService.sanitizeExtension(file.mimetype);
        const storagePath = this.storage.buildStoragePath(campaignId, giftId, ext);
        const publicUrl = await this.storage.uploadFile(
          file.buffer,
          storagePath,
          file.mimetype,
        );
        return { url: publicUrl, originalname: file.originalname, storagePath };
      }),
    );

    const fulfilled = uploadResults
      .filter(
        (r): r is PromiseFulfilledResult<{
          url: string;
          originalname: string;
          storagePath: string;
        }> => r.status === 'fulfilled',
      )
      .map((r) => r.value);
    const rejections = uploadResults.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    if (rejections.length > 0) {
      await Promise.allSettled(
        fulfilled.map((r) => this.storage.deleteFile(r.storagePath)),
      );
      throw rejections[0].reason;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.giftImage.findMany({
          where: { giftId },
          orderBy: { sortOrder: 'asc' },
        });

        let nextSortOrder =
          existing.length > 0
            ? existing[existing.length - 1].sortOrder + 1
            : 0;

        const hasPrimary = existing.some((img) => img.isPrimary);

        for (const uploaded of fulfilled) {
          await tx.giftImage.create({
            data: {
              giftId,
              imageUrl: uploaded.url,
              altText: uploaded.originalname,
              sortOrder: nextSortOrder,
              isPrimary: !hasPrimary && nextSortOrder === 0,
            },
          });
          nextSortOrder++;
        }
      });
    } catch (err) {
      await Promise.allSettled(
        fulfilled.map((r) => this.storage.deleteFile(r.storagePath)),
      );
      throw err;
    }

    return this.findOne(giftId);
  }

  // ── Admin: image management ─────────────────────────────

  private extractStoragePath(publicUrl: string): string | null {
    try {
      const url = new URL(publicUrl);
      const parts = url.pathname.split('/');
      const publicIdx = parts.indexOf('public');
      if (publicIdx === -1) return null;
      return parts.slice(publicIdx + 2).join('/');
    } catch {
      return null;
    }
  }

  async deleteImage(giftId: number, imageId: number) {
    await this.findOne(giftId);

    const image = await this.prisma.giftImage.findFirst({
      where: { id: imageId, giftId },
    });

    if (!image) {
      throw new NotFoundException('Imagen no encontrada.');
    }

    const storagePath = this.extractStoragePath(image.imageUrl);
    if (storagePath) {
      this.storage.deleteFile(storagePath).catch((err) => {
        Logger.warn(`deleteImage: cleanup failed for ${storagePath}: ${err?.message}`, GiftsService.name);
      });
    }

    const wasPrimary = image.isPrimary;

    await this.prisma.$transaction(async (tx) => {
      await tx.giftImage.delete({ where: { id: imageId } });

      if (wasPrimary) {
        const firstRemaining = await tx.giftImage.findFirst({
          where: { giftId },
          orderBy: { sortOrder: 'asc' },
        });
        if (firstRemaining) {
          await tx.giftImage.update({
            where: { id: firstRemaining.id },
            data: { isPrimary: true },
          });
        }
      }

      const remaining = await tx.giftImage.findMany({
        where: { giftId },
        orderBy: { sortOrder: 'asc' },
      });
      for (let i = 0; i < remaining.length; i++) {
        await tx.giftImage.update({
          where: { id: remaining[i].id },
          data: { sortOrder: i },
        });
      }
    });

    return this.findOne(giftId);
  }

  async deleteAllImages(giftId: number) {
    await this.findOne(giftId);

    const images = await this.prisma.giftImage.findMany({
      where: { giftId },
    });

    await Promise.allSettled(
      images.map(async (img) => {
        const storagePath = this.extractStoragePath(img.imageUrl);
        if (storagePath) {
          await this.storage.deleteFile(storagePath);
        }
      }),
    );

    await this.prisma.giftImage.deleteMany({ where: { giftId } });

    return this.findOne(giftId);
  }

  async setPrimaryImage(giftId: number, imageId: number) {
    await this.findOne(giftId);

    const image = await this.prisma.giftImage.findFirst({
      where: { id: imageId, giftId },
    });

    if (!image) {
      throw new NotFoundException('Imagen no encontrada.');
    }

    if (image.isPrimary) {
      return this.findOne(giftId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.giftImage.updateMany({
        where: { giftId },
        data: { isPrimary: false },
      });

      await tx.giftImage.update({
        where: { id: imageId },
        data: { isPrimary: true, sortOrder: 0 },
      });

      const others = await tx.giftImage.findMany({
        where: { giftId, id: { not: imageId } },
        orderBy: { sortOrder: 'asc' },
      });

      for (let i = 0; i < others.length; i++) {
        await tx.giftImage.update({
          where: { id: others[i].id },
          data: { sortOrder: i + 1 },
        });
      }
    });

    return this.findOne(giftId);
  }

  async replaceImage(
    giftId: number,
    imageId: number,
    file: Express.Multer.File,
  ) {
    const gift = await this.findOne(giftId);

    const oldImage = await this.prisma.giftImage.findFirst({
      where: { id: imageId, giftId },
    });

    if (!oldImage) {
      throw new NotFoundException('Imagen no encontrada.');
    }

    const campaignId = gift.campaignId;

    SupabaseStorageService.validateMimeType(file.mimetype);
    SupabaseStorageService.validateFileSize(file.size);

    const ext = SupabaseStorageService.sanitizeExtension(file.mimetype);
    const storagePath = this.storage.buildStoragePath(campaignId, giftId, ext);
    const publicUrl = await this.storage.uploadFile(
      file.buffer,
      storagePath,
      file.mimetype,
    );

    const oldPath = this.extractStoragePath(oldImage.imageUrl);
    if (oldPath) {
      this.storage.deleteFile(oldPath).catch((err) => {
        Logger.warn(`replaceImage: cleanup failed for ${oldPath}: ${err?.message}`, GiftsService.name);
      });
    }

    await this.prisma.giftImage.update({
      where: { id: imageId },
      data: {
        imageUrl: publicUrl,
        altText: file.originalname,
      },
    });

    return this.findOne(giftId);
  }
}

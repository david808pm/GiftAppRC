import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmSelectionDto } from './dto/confirm-selection.dto';
import { Prisma } from '@prisma/client';
import { assertCampaignWindowOpen } from '../common/utils/campaign-window';

@Injectable()
export class PublicSelectionService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Helpers ──────────────────────────────────────────────

  private async validateEmployeeAndCampaign(
    employeeId: number,
    campaignId: number,
  ) {
    const [employee, campaign] = await Promise.all([
      this.prisma.employee.findUnique({ where: { id: employeeId } }),
      this.prisma.campaign.findUnique({ where: { id: campaignId } }),
    ]);

    if (!employee || employee.deletedAt) {
      throw new NotFoundException('Sesión inválida.');
    }

    // The token pins a campaign; reject if the employee was since moved.
    if (employee.campaignId !== campaignId) {
      throw new ForbiddenException('Tu sesión no corresponde a esta campaña.');
    }

    if (employee.status === 'BLOCKED') {
      throw new ForbiddenException(
        'Tu cuenta ha sido bloqueada. Contacta a soporte.',
      );
    }

    if (employee.status === 'CONFIRMED') {
      throw new ForbiddenException(
        'Ya has confirmado tu selección de regalos.',
      );
    }

    if (!campaign || campaign.deletedAt) {
      throw new NotFoundException('La campaña no está disponible.');
    }

    if (campaign.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'Esta campaña no está disponible actualmente.',
      );
    }

    assertCampaignWindowOpen(campaign);

    return { employee, campaign };
  }

  // ── GET /api/public/beneficiaries ────────────────────────

  async getBeneficiaries(user: {
    employeeId: number;
    campaignId: number;
  }) {
    await this.validateEmployeeAndCampaign(
      user.employeeId,
      user.campaignId,
    );

    const beneficiaries = await this.prisma.beneficiary.findMany({
      where: {
        employeeId: user.employeeId,
        deletedAt: null,
      },
      select: {
        id: true,
        fullName: true,
        age: true,
        gender: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return { beneficiaries };
  }

  // ── GET /api/public/beneficiaries/:id/gifts ──────────────

  async getCompatibleGifts(
    beneficiaryId: number,
    user: { employeeId: number; campaignId: number },
  ) {
    const { employee } = await this.validateEmployeeAndCampaign(
      user.employeeId,
      user.campaignId,
    );

    // Validate beneficiary belongs to employee
    const beneficiary = await this.prisma.beneficiary.findUnique({
      where: { id: beneficiaryId },
    });

    if (
      !beneficiary ||
      beneficiary.deletedAt ||
      beneficiary.employeeId !== user.employeeId
    ) {
      throw new NotFoundException('Beneficiario no encontrado.');
    }

    // Find compatible gifts
    // TODO: Final compatibility and stock checks will be repeated inside the future transactional confirmation endpoint.

    const gifts = await this.prisma.gift.findMany({
      where: {
        campaignId: user.campaignId,
        deletedAt: null,
        status: 'ACTIVE',
        stock: { gt: 0 },
        minAge: { lte: beneficiary.age },
        maxAge: { gte: beneficiary.age },
        OR: [
          { allowedGender: 'all' },
          { allowedGender: beneficiary.gender },
        ],
      },
      select: {
        id: true,
        name: true,
        reference: true,
        shortDescription: true,
        technicalDescription: true,
        dimensions: true,
        minAge: true,
        maxAge: true,
        allowedGender: true,
        images: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            imageUrl: true,
            altText: true,
            sortOrder: true,
            isPrimary: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return {
      beneficiary: {
        id: beneficiary.id,
        fullName: beneficiary.fullName,
        age: beneficiary.age,
        gender: beneficiary.gender,
      },
      gifts,
    };
  }

  // ── POST /api/public/selections/confirm ──────────────────

  async confirmSelection(
    dto: ConfirmSelectionDto,
    user: { employeeId: number; campaignId: number },
  ) {
    const { employeeId, campaignId } = user;

    return this.prisma.directClient.$transaction(async (tx) => {
      // 1. Validate campaign
      const campaign = await tx.campaign.findUnique({
        where: { id: campaignId },
      });
      if (!campaign || campaign.deletedAt) {
        throw new NotFoundException('La campaña no está disponible.');
      }
      if (campaign.status !== 'ACTIVE') {
        throw new ForbiddenException('Esta campaña no está disponible actualmente.');
      }
      assertCampaignWindowOpen(campaign);

      // 2. Validate employee
      const employee = await tx.employee.findUnique({
        where: { id: employeeId },
      });
      if (!employee || employee.deletedAt) {
        throw new NotFoundException('Sesión inválida.');
      }
      if (employee.campaignId !== campaignId) {
        throw new ForbiddenException('El empleado no pertenece a esta campaña.');
      }
      if (employee.status === 'BLOCKED') {
        throw new ForbiddenException('Tu cuenta ha sido bloqueada. Contacta a soporte.');
      }
      if (employee.status === 'CONFIRMED') {
        throw new ConflictException('Ya has confirmado tu selección de regalos.');
      }

      // 3. Check no existing CONFIRMED selection
      const existingSelection = await tx.selection.findUnique({
        where: { campaignId_employeeId: { campaignId, employeeId } },
      });
      if (existingSelection && existingSelection.status === 'CONFIRMED') {
        throw new ConflictException('Ya has confirmado tu selección de regalos.');
      }

      // 4. Load active beneficiaries
      const beneficiaries = await tx.beneficiary.findMany({
        where: { employeeId, deletedAt: null },
      });

      if (beneficiaries.length === 0) {
        throw new BadRequestException('No tienes beneficiarios asociados.');
      }

      if (dto.items.length !== beneficiaries.length) {
        throw new BadRequestException('Debes seleccionar un regalo para cada beneficiario.');
      }

      // 5. Validate no duplicate beneficiaryId
      const beneficiaryIds = dto.items.map((i) => i.beneficiaryId);
      const uniqueIds = new Set(beneficiaryIds);
      if (uniqueIds.size !== beneficiaryIds.length) {
        throw new BadRequestException('No puedes seleccionar el mismo beneficiario más de una vez.');
      }

      // 6. Every beneficiaryId must belong to employee
      const validBeneficiaryIds = new Set(beneficiaries.map((b) => b.id));
      for (const bid of beneficiaryIds) {
        if (!validBeneficiaryIds.has(bid)) {
          throw new BadRequestException('Uno de los beneficiarios no pertenece a tu cuenta.');
        }
      }

      // 7. Load gifts and primary images
      const giftIds = [...new Set(dto.items.map((i) => i.giftId))];
      const gifts = await tx.gift.findMany({
        where: { id: { in: giftIds } },
        include: { images: { where: { isPrimary: true }, take: 1 } },
      });
      const giftsMap = new Map(gifts.map((g) => [g.id, g]));

      // 8. Validate every gift
      for (const [idx, item] of dto.items.entries()) {
        const gift = giftsMap.get(item.giftId);
        const beneficiary = beneficiaries.find((b) => b.id === item.beneficiaryId);

        if (!beneficiary) {
          throw new BadRequestException('Uno de los beneficiarios no fue encontrado.');
        }
        if (!gift) {
          throw new BadRequestException('Uno de los regalos seleccionados no existe.');
        }
        if (gift.campaignId !== campaignId) {
          throw new BadRequestException('Uno de los regalos no pertenece a esta campaña.');
        }
        if (gift.deletedAt) {
          throw new BadRequestException('Uno de los regalos seleccionados ya no está disponible.');
        }
        if (gift.status !== 'ACTIVE') {
          throw new BadRequestException('Uno de los regalos seleccionados no está activo.');
        }
        if (gift.stock <= 0) {
          throw new BadRequestException(`El regalo "${gift.name}" está agotado.`);
        }
        if (gift.minAge > beneficiary.age || gift.maxAge < beneficiary.age) {
          throw new BadRequestException(
            'Uno de los regalos seleccionados no es compatible con el beneficiario.',
          );
        }
        if (
          gift.allowedGender !== 'all' &&
          gift.allowedGender !== beneficiary.gender
        ) {
          throw new BadRequestException(
            'Uno de los regalos seleccionados no es compatible con el beneficiario.',
          );
        }
      }

      // 9. Create Selection. The unique constraint (campaignId, employeeId) is
      // the last line of defense against a concurrent double-confirm that both
      // passed the existence check above; translate it into a clean 409.
      let selection;
      try {
        selection = await tx.selection.create({
          data: {
            campaignId,
            employeeId,
            status: 'CONFIRMED',
            confirmedAt: new Date(),
            employeeNameSnapshot: employee.fullName,
            employeeDocumentIdSnapshot: employee.documentId,
            campaignNameSnapshot: campaign.name,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new ConflictException('Ya has confirmado tu selección de regalos.');
        }
        throw err;
      }

      // 10. Create SelectionItems + StockMovements + decrement stock
      const selectionItems: any[] = [];

      for (const item of dto.items) {
        const beneficiary = beneficiaries.find((b) => b.id === item.beneficiaryId);
        const gift = giftsMap.get(item.giftId);
        
        if (!beneficiary || !gift) {
          throw new BadRequestException('Error interno: beneficiario o regalo no encontrado.');
        }
        
        const primaryImage = gift.images?.[0];
        const previousStock = gift.stock; // Stock value BEFORE decrement

        // Safe conditional stock decrement
        const updatedGift = await tx.gift.updateMany({
          where: { id: gift.id, stock: { gt: 0 } },
          data: { stock: { decrement: 1 } },
        });

        if (updatedGift.count !== 1) {
          throw new BadRequestException(
            'El regalo seleccionado ya no tiene stock disponible.',
          );
        }

        // Fetch updated stock
        const giftAfter = await tx.gift.findUnique({
          where: { id: gift.id },
          select: { stock: true },
        });
        const newStock = giftAfter?.stock ?? previousStock - 1;

        // Update the in-memory gift snapshot so that a subsequent item
        // selecting the same gift reads the current stock for an accurate
        // StockMovement.previousStock. The authoritative decrement is the
        // updateMany above — this only keeps the audit trail consistent.
        gift.stock = newStock;

        // Create SelectionItem
        const selectionItem = await tx.selectionItem.create({
          data: {
            selectionId: selection.id,
            campaignId,
            employeeId,
            beneficiaryId: beneficiary.id,
            giftId: gift.id,
            beneficiaryNameSnapshot: beneficiary.fullName,
            beneficiaryAgeSnapshot: beneficiary.age,
            beneficiaryGenderSnapshot: beneficiary.gender,
            giftNameSnapshot: gift.name,
            giftReferenceSnapshot: gift.reference,
            giftImageUrlSnapshot: primaryImage?.imageUrl || null,
            confirmedAt: new Date(),
          },
        });

        // Create StockMovement
        await tx.stockMovement.create({
          data: {
            giftId: gift.id,
            campaignId,
            selectionItemId: selectionItem.id,
            movementType: 'SELECTION_CONFIRMATION',
            quantityChange: -1,
            previousStock,
            newStock,
            reason: 'Confirmación de selección de regalo',
          },
        });

        selectionItems.push({
          beneficiaryId: beneficiary.id,
          beneficiaryName: beneficiary.fullName,
          giftId: gift.id,
          giftName: gift.name,
          giftReference: gift.reference,
        });
      }

      // 11. Update employee to CONFIRMED
      await tx.employee.update({
        where: { id: employeeId },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });

      // 12. Create EmailLog (SIMULATED)
      await tx.emailLog.create({
        data: {
          campaignId,
          employeeId,
          selectionId: selection.id,
          recipientEmail: employee.email || null,
          emailType: 'CONFIRMATION',
          status: 'SIMULATED',
          subject: 'Confirmación de selección de regalos',
          details: `Simulación de correo de confirmación para ${employee.fullName}. Campaña: ${campaign.name}. Regalos seleccionados: ${selectionItems.map((si) => si.giftName).join(', ')}.`,
        },
      });

      // 13. Return summary
      return {
        ok: true,
        selection: {
          id: selection.id,
          campaignId,
          employeeId,
          status: 'CONFIRMED',
          confirmedAt: selection.confirmedAt,
          items: selectionItems,
        },
      };
    }, { timeout: 15000 });
  }

  // ── GET /api/public/selections/my-confirmed-selection ────

  async getConfirmedSelection(user: {
    employeeId: number;
    campaignId: number;
  }) {
    const selection = await this.prisma.selection.findUnique({
      where: {
        campaignId_employeeId: {
          campaignId: user.campaignId,
          employeeId: user.employeeId,
        },
      },
      include: {
        items: {
          orderBy: { confirmedAt: 'asc' },
        },
      },
    });

    if (!selection || selection.status !== 'CONFIRMED') {
      throw new NotFoundException(
        'No se encontró una selección confirmada.',
      );
    }

    return {
      selection: {
        id: selection.id,
        campaignId: selection.campaignId,
        employeeId: selection.employeeId,
        status: selection.status,
        confirmedAt: selection.confirmedAt,
        employeeName: selection.employeeNameSnapshot,
        employeeDocumentId: selection.employeeDocumentIdSnapshot,
        campaignName: selection.campaignNameSnapshot,
        items: selection.items.map((item) => ({
          beneficiaryId: item.beneficiaryId,
          beneficiaryName: item.beneficiaryNameSnapshot,
          beneficiaryAge: item.beneficiaryAgeSnapshot,
          beneficiaryGender: item.beneficiaryGenderSnapshot,
          giftId: item.giftId,
          giftName: item.giftNameSnapshot,
          giftReference: item.giftReferenceSnapshot,
          giftImageUrl: item.giftImageUrlSnapshot,
        })),
      },
    };
  }
}

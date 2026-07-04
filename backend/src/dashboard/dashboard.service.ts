import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { DashboardCache } from './dashboard.cache';

@Injectable()
export class DashboardService {
  private readonly cache = new DashboardCache();
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getStats(user?: { role: string; companyId?: number }) {
    const cacheKey = `${user?.role || 'public'}_${user?.companyId || 'all'}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      this.logger.debug(`Cache hit for key=${cacheKey}`);
      return cached;
    }

    this.logger.debug(`Cache miss for key=${cacheKey}, calculating...`);
    // Build base filters for company scoping and exclude soft-deleted campaigns
    const campaignFilter: Prisma.CampaignWhereInput = { deletedAt: null };
    const employeeFilter: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      campaign: { deletedAt: null },
    };
    const beneficiaryFilter: Prisma.BeneficiaryWhereInput = {
      deletedAt: null,
      employee: {
        deletedAt: null,
        campaign: { deletedAt: null },
      },
    };
    const giftFilter: Prisma.GiftWhereInput = {
      deletedAt: null,
      campaign: { deletedAt: null },
    };
    const supportFilter: Prisma.SupportRequestWhereInput = {
      campaignId: { not: null },
      campaign: { deletedAt: null },
    };
    const selectionFilter: Prisma.SelectionWhereInput = {
      campaign: { deletedAt: null },
    };
    const companyFilter: Prisma.CompanyWhereInput = {
      deletedAt: null,
      isActive: true,
    };

    // Apply company scoping for COMPANY_VIEWER
    if (user?.role === 'COMPANY_VIEWER') {
      if (!user.companyId) {
        throw new ForbiddenException('No tienes compañía asignada.');
      }
      campaignFilter.companyId = user.companyId;
      employeeFilter.campaign = { companyId: user.companyId, deletedAt: null };
      beneficiaryFilter.employee = {
        campaign: { companyId: user.companyId, deletedAt: null },
        deletedAt: null,
      };
      giftFilter.campaign = { companyId: user.companyId, deletedAt: null };
      supportFilter.campaign = { companyId: user.companyId, deletedAt: null };
      selectionFilter.campaign = { companyId: user.companyId, deletedAt: null };
      companyFilter.id = user.companyId;
    }

    const [
      campaignsAll,
      activeCampaigns,
      closedCampaigns,
      draftCampaigns,
      employeesAll,
      pendingEmployees,
      inProgressEmployees,
      confirmedEmployees,
      blockedEmployees,
      beneficiariesAll,
      giftsAll,
      activeGifts,
      inactiveGifts,
      stockSum,
      supportAll,
      openSupport,
      inReviewSupport,
      resolvedSupport,
      confirmedSelections,
      cancelledSelections,
      companiesCount,
    ] = await Promise.all([
      this.prisma.campaign.count({ where: campaignFilter }),
      this.prisma.campaign.count({ where: { ...campaignFilter, status: 'ACTIVE' } }),
      this.prisma.campaign.count({
        where: {
          ...campaignFilter,
          status: { in: ['CLOSED', 'ARCHIVED', 'PAUSED'] },
        },
      }),
      this.prisma.campaign.count({ where: { ...campaignFilter, status: 'DRAFT' } }),
      this.prisma.employee.count({ where: employeeFilter }),
      this.prisma.employee.count({ where: { ...employeeFilter, status: 'PENDING' } }),
      this.prisma.employee.count({ where: { ...employeeFilter, status: 'IN_PROGRESS' } }),
      this.prisma.employee.count({ where: { ...employeeFilter, status: 'CONFIRMED' } }),
      this.prisma.employee.count({ where: { ...employeeFilter, status: 'BLOCKED' } }),
      this.prisma.beneficiary.count({ where: beneficiaryFilter }),
      this.prisma.gift.count({ where: giftFilter }),
      this.prisma.gift.count({ where: { ...giftFilter, status: 'ACTIVE' } }),
      this.prisma.gift.count({ where: { ...giftFilter, status: 'INACTIVE' } }),
      this.prisma.gift.aggregate({
        where: giftFilter,
        _sum: { stock: true },
      }),
      this.prisma.supportRequest.count({ where: supportFilter }),
      this.prisma.supportRequest.count({ where: { ...supportFilter, status: 'OPEN' } }),
      this.prisma.supportRequest.count({ where: { ...supportFilter, status: 'IN_REVIEW' } }),
      this.prisma.supportRequest.count({ where: { ...supportFilter, status: 'RESOLVED' } }),
      this.prisma.selectionItem.count({ where: { selection: { ...selectionFilter, status: 'CONFIRMED' } } }),
      this.prisma.selection.count({ where: { ...selectionFilter, status: 'CANCELLED' } }),
      this.prisma.company.count({ where: companyFilter }),
    ]);

    const result = {
      campaigns: campaignsAll,
      activeCampaigns,
      closedCampaigns,
      draftCampaigns,
      companies: companiesCount,
      employees: employeesAll,
      pendingEmployees,
      inProgressEmployees,
      confirmedEmployees,
      blockedEmployees,
      beneficiaries: beneficiariesAll,
      gifts: giftsAll,
      activeGifts,
      inactiveGifts,
      stock: stockSum._sum.stock || 0,
      supportRequests: supportAll,
      openSupportRequests: openSupport,
      inReviewSupportRequests: inReviewSupport,
      resolvedSupportRequests: resolvedSupport,
      selections: confirmedSelections,
      cancelledSelections,
    };

    this.cache.set(cacheKey, result);
    return result;
  }
}

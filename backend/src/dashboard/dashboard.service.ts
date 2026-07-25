import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { DashboardCache } from './dashboard.cache';

function countFromGroup(group: any): number {
  const c = group?._count;
  if (typeof c === 'number') return c;
  if (c && typeof c === 'object' && typeof c._all === 'number') return c._all;
  return 0;
}

function sumGroupCounts(groups: any[]): number {
  return groups.reduce((sum, g) => sum + countFromGroup(g), 0);
}

function countByField(groups: any[], field: string, values: string | string[]): number {
  const targets: string[] = Array.isArray(values) ? values : [values];
  return groups
    .filter(g => targets.includes(g[field]))
    .reduce((sum, g) => sum + countFromGroup(g), 0);
}

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
      campaignGroups,
      employeeGroups,
      beneficiaryTotal,
      giftGroups,
      stockAggregate,
      supportGroups,
      confirmedSelections,
      cancelledSelections,
      companiesCount,
    ] = await Promise.all([
      this.prisma.campaign.groupBy({ by: ['status'], where: campaignFilter, _count: true }),
      this.prisma.employee.groupBy({ by: ['status'], where: employeeFilter, _count: true }),
      this.prisma.beneficiary.count({ where: beneficiaryFilter }),
      this.prisma.gift.groupBy({ by: ['status'], where: giftFilter, _count: true }),
      this.prisma.gift.aggregate({ where: giftFilter, _sum: { stock: true } }),
      this.prisma.supportRequest.groupBy({ by: ['status'], where: supportFilter, _count: true }),
      this.prisma.selectionItem.count({ where: { selection: { ...selectionFilter, status: 'CONFIRMED' } } }),
      this.prisma.selection.count({ where: { ...selectionFilter, status: 'CANCELLED' } }),
      this.prisma.company.count({ where: companyFilter }),
    ]);

    const result = {
      campaigns: sumGroupCounts(campaignGroups),
      activeCampaigns: countByField(campaignGroups, 'status', 'ACTIVE'),
      closedCampaigns: countByField(campaignGroups, 'status', ['CLOSED', 'ARCHIVED', 'PAUSED']),
      draftCampaigns: countByField(campaignGroups, 'status', 'DRAFT'),
      companies: companiesCount,
      employees: sumGroupCounts(employeeGroups),
      pendingEmployees: countByField(employeeGroups, 'status', 'PENDING'),
      inProgressEmployees: countByField(employeeGroups, 'status', 'IN_PROGRESS'),
      confirmedEmployees: countByField(employeeGroups, 'status', 'CONFIRMED'),
      blockedEmployees: countByField(employeeGroups, 'status', 'BLOCKED'),
      beneficiaries: beneficiaryTotal,
      gifts: sumGroupCounts(giftGroups),
      activeGifts: countByField(giftGroups, 'status', 'ACTIVE'),
      inactiveGifts: countByField(giftGroups, 'status', 'INACTIVE'),
      stock: stockAggregate._sum.stock || 0,
      supportRequests: sumGroupCounts(supportGroups),
      openSupportRequests: countByField(supportGroups, 'status', 'OPEN'),
      inReviewSupportRequests: countByField(supportGroups, 'status', 'IN_REVIEW'),
      resolvedSupportRequests: countByField(supportGroups, 'status', 'RESOLVED'),
      selections: confirmedSelections,
      cancelledSelections,
    };

    this.cache.set(cacheKey, result);
    return result;
  }
}

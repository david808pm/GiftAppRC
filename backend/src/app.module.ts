import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { EmployeesModule } from './employees/employees.module';
import { BeneficiariesModule } from './beneficiaries/beneficiaries.module';
import { GiftsModule } from './gifts/gifts.module';
import { SupportRequestsModule } from './support-requests/support-requests.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SelectionsModule } from './selections/selections.module';
import { ReportsModule } from './reports/reports.module';
import { PublicAuthModule } from './public-auth/public-auth.module';
import { PublicSelectionModule } from './public-selection/public-selection.module';
import { ImportsModule } from './imports/imports.module';
import { GiftImportsModule } from './gift-imports/gift-import.module';
import { AdminUsersModule } from './admin-users/admin-users.module';
import { CompaniesModule } from './companies/companies.module';

@Module({
  imports: [
    // Global rate limiting: 100 requests / minute / IP by default.
    // Stricter per-route limits are applied with @Throttle() on auth endpoints.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule, HealthModule, AuthModule, CampaignsModule, EmployeesModule, BeneficiariesModule, GiftsModule, SupportRequestsModule, DashboardModule, SelectionsModule, ReportsModule, PublicAuthModule, PublicSelectionModule, ImportsModule, GiftImportsModule, AdminUsersModule, CompaniesModule],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

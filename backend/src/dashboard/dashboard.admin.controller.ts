import { Controller, Get, UseGuards, Req, UseInterceptors } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Request } from 'express';
import { TrackPerformance } from '../common/decorators/track-performance.decorator';
import { PerformanceTimingInterceptor } from '../common/interceptors/performance-timing.interceptor';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardAdminController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @Roles('ADMIN', 'SUPER_ADMIN', 'COMPANY_VIEWER')
  @UseInterceptors(PerformanceTimingInterceptor)
  @TrackPerformance('admin.dashboard.stats')
  getStats(@Req() req: Request) {
    const user = req.user as any;
    return this.dashboardService.getStats(user);
  }
}

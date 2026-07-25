import { Controller, Get, Query, UseGuards, Res, Req, UseInterceptors } from '@nestjs/common';
import { SelectionsService } from '../selections/selections.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Response, Request } from 'express';
import { TrackPerformance } from '../common/decorators/track-performance.decorator';
import { PerformanceTimingInterceptor } from '../common/interceptors/performance-timing.interceptor';

function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

@Controller('admin/reports/selections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsAdminController {
  constructor(private readonly selectionsService: SelectionsService) {}

  @Get('export-data')
  @Roles('SUPER_ADMIN', 'ADMIN', 'COMPANY_VIEWER')
  exportData(
    @Query('campaignId') campaignId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Req() req?: Request,
  ) {
    const user = req?.user as any;
    return this.selectionsService.exportData(
      {
        campaignId: campaignId !== undefined ? Number(campaignId) : undefined,
        fromDate,
        toDate,
      },
      user,
    );
  }

  @Get('export-xlsx')
  @Roles('SUPER_ADMIN', 'ADMIN', 'COMPANY_VIEWER')
  @UseInterceptors(PerformanceTimingInterceptor)
  @TrackPerformance('admin.export.selections')
  async exportXlsx(
    @Res() res: Response,
    @Query('campaignId') campaignId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Req() req?: Request,
  ) {
    const user = req?.user as any;
    const buffer = await this.selectionsService.exportXlsx(
      {
        campaignId: campaignId !== undefined ? Number(campaignId) : undefined,
        fromDate,
        toDate,
      },
      user,
    );

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="envios_selecciones_${todayString()}.xlsx"`,
    });

    res.send(buffer);
  }
}

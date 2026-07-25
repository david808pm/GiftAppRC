import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { SelectionsService } from './selections.service';
import { SelectionQueryDto } from './dto/selection-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Request } from 'express';
import { TrackPerformance } from '../common/decorators/track-performance.decorator';
import { PerformanceTimingInterceptor } from '../common/interceptors/performance-timing.interceptor';

@Controller('admin/selections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SelectionsAdminController {
  constructor(private readonly selectionsService: SelectionsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'COMPANY_VIEWER')
  @UseInterceptors(PerformanceTimingInterceptor)
  @TrackPerformance('admin.selections.list')
  findAll(@Query() query: SelectionQueryDto, @Req() req: Request) {
    const user = req.user as any;
    return this.selectionsService.findAll(query, user);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'COMPANY_VIEWER')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = req.user as any;
    return this.selectionsService.findOne(id, user);
  }
}

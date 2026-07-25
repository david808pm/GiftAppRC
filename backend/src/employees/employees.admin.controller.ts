import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  Req,
  Res,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Request, Response } from 'express';
import { TrackPerformance } from '../common/decorators/track-performance.decorator';
import { PerformanceTimingInterceptor } from '../common/interceptors/performance-timing.interceptor';

function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

@Controller('admin/employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeesAdminController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'COMPANY_VIEWER')
  @UseInterceptors(PerformanceTimingInterceptor)
  @TrackPerformance('admin.employees.list')
  findAll(@Query() query: EmployeeQueryDto, @Req() req: Request) {
    const user = req.user as any;
    return this.employeesService.findAll(query, user);
  }

  @Get('export-xlsx')
  @Roles('SUPER_ADMIN', 'COMPANY_VIEWER')
  @UseInterceptors(PerformanceTimingInterceptor)
  @TrackPerformance('admin.export.employees')
  async exportXlsx(
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('campaignId') campaignId?: string,
    @Query('status') status?: string,
    @Req() req?: Request,
  ) {
    const user = req?.user as any;
    const buffer = await this.employeesService.exportXlsx(
      {
        search,
        campaignId: campaignId !== undefined ? Number(campaignId) : undefined,
        status,
      },
      user,
    );

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="empleados_${todayString()}.xlsx"`,
    });

    res.send(buffer);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'COMPANY_VIEWER')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = req.user as any;
    return this.employeesService.findOne(id, user);
  }

  @Post()
  @Roles('SUPER_ADMIN')
  create(@Body() dto: CreateEmployeeDto, @Req() req: Request) {
    const adminUserId = (req.user as any).userId;
    return this.employeesService.create(dto, adminUserId);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
    @Req() req: Request,
  ) {
    const adminUserId = (req.user as any).userId;
    return this.employeesService.update(id, dto, adminUserId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('SUPER_ADMIN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.employeesService.remove(id);
  }
}

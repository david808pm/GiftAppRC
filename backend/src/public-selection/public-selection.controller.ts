import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseIntPipe,
  Req,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PublicSelectionService } from './public-selection.service';
import { ConfirmSelectionDto } from './dto/confirm-selection.dto';
import { PublicEmployeeJwtGuard } from '../public-auth/guards/public-employee-jwt.guard';
import { Request } from 'express';
import { TrackPerformance } from '../common/decorators/track-performance.decorator';
import { PerformanceTimingInterceptor } from '../common/interceptors/performance-timing.interceptor';

@Controller('public')
@UseGuards(PublicEmployeeJwtGuard)
export class PublicSelectionController {
  constructor(private readonly publicSelectionService: PublicSelectionService) {}

  @Get('beneficiaries')
  getBeneficiaries(@Req() req: Request) {
    return this.publicSelectionService.getBeneficiaries(req.user as any);
  }

  @Get('beneficiaries/:beneficiaryId/gifts')
  @UseInterceptors(PerformanceTimingInterceptor)
  @TrackPerformance('public.gifts.compatible')
  getCompatibleGifts(
    @Param('beneficiaryId', ParseIntPipe) beneficiaryId: number,
    @Req() req: Request,
  ) {
    return this.publicSelectionService.getCompatibleGifts(
      beneficiaryId,
      req.user as any,
    );
  }

  @Post('selections/confirm')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(PerformanceTimingInterceptor)
  @TrackPerformance('public.selection.confirm')
  confirmSelection(@Body() dto: ConfirmSelectionDto, @Req() req: Request) {
    return this.publicSelectionService.confirmSelection(
      dto,
      req.user as any,
    );
  }

  @Get('selections/my-confirmed-selection')
  getConfirmedSelection(@Req() req: Request) {
    return this.publicSelectionService.getConfirmedSelection(req.user as any);
  }
}

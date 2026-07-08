import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicAuthService } from './public-auth.service';
import { EmployeeLoginDto } from './dto/employee-login.dto';
import { RequestCodeDto } from './dto/request-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { PublicEmployeeJwtGuard } from './guards/public-employee-jwt.guard';
import { Request } from 'express';

@Controller('public')
export class PublicAuthController {
  constructor(private readonly publicAuthService: PublicAuthService) {}

  // Brute-force / enumeration protection: 5 attempts per minute per IP.
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('campaigns/:slug/employee-login')
  @HttpCode(HttpStatus.OK)
  employeeLogin(@Param('slug') slug: string, @Body() dto: EmployeeLoginDto) {
    return this.publicAuthService.employeeLogin(slug, dto);
  }

  // ── Email OTP endpoints ──────────────────────────────────
  // Same strict per-IP throttling as the classic login.
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('auth/request-code')
  @HttpCode(HttpStatus.OK)
  requestCode(@Body() dto: RequestCodeDto) {
    return this.publicAuthService.requestCode(dto.campaignSlug, dto);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('auth/verify-code')
  @HttpCode(HttpStatus.OK)
  verifyCode(@Body() dto: VerifyCodeDto) {
    return this.publicAuthService.verifyCode(dto.campaignSlug, dto);
  }

  @Get('employee-session/me')
  @UseGuards(PublicEmployeeJwtGuard)
  getSession(@Req() req: Request) {
    return this.publicAuthService.getSession(req.user as any);
  }
}

import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Request } from 'express';
import { TrackPerformance } from '../common/decorators/track-performance.decorator';
import { PerformanceTimingInterceptor } from '../common/interceptors/performance-timing.interceptor';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Brute-force protection: at most 5 login attempts per minute per IP.
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(PerformanceTimingInterceptor)
  @TrackPerformance('admin.auth.me')
  getProfile(@Req() req: Request) {
    const user = req.user as {
      userId: number;
      name: string;
      email: string;
      role: string;
      companyId?: number;
      company?: { id: number; name: string; slug: string } | null;
    };

    const allowedRoles = ['ADMIN', 'SUPER_ADMIN', 'COMPANY_VIEWER'];
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException('Acceso denegado.');
    }

    return {
      id: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      company: user.company ?? null,
    };
  }
}

import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { HealthService } from './health.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  live() {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  async ready(@Res() res: Response) {
    const ready = await this.healthService.getReadiness();
    const timestamp = new Date().toISOString();

    if (ready) {
      res.status(HttpStatus.OK).json({
        status: 'ok',
        ready: true,
        timestamp,
      });
    } else {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        status: 'error',
        ready: false,
        timestamp,
      });
    }
  }

  @Get('version')
  version() {
    return this.healthService.getVersion();
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly appName: string;
  private readonly appVersion: string;
  private readonly commit: string;
  private readonly buildDate: string;
  private readonly environment: string;

  constructor(private readonly prisma: PrismaService) {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf-8'),
    );
    this.appName = pkg.name;
    this.appVersion = pkg.version;
    this.commit =
      process.env.APP_COMMIT || process.env.GIT_COMMIT || 'unknown';
    this.buildDate = process.env.BUILD_DATE || 'unknown';
    this.environment = process.env.NODE_ENV || 'development';
  }

  getLiveness() {
    return {
      status: 'ok' as const,
      live: true,
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<boolean> {
    const TIMEOUT_MS = 2000;

    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('DB_TIMEOUT')), TIMEOUT_MS),
        ),
      ]);
      return true;
    } catch (err) {
      this.logger.error('Readiness check failed', err);
      return false;
    }
  }

  getVersion() {
    return {
      status: 'ok' as const,
      name: this.appName,
      version: this.appVersion,
      commit: this.commit,
      buildDate: this.buildDate,
      environment: this.environment,
    };
  }
}

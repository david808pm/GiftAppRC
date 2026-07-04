import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TimingInterceptor } from './common/interceptors/timing.interceptor';
import { join } from 'path';
import type { Response } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Security headers. Allow cross-origin resource loading so the frontend
  // (served from a different origin) can display campaign logos from /uploads.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Limit request body size to mitigate memory-exhaustion DoS.
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });

  // Global prefix
  app.setGlobalPrefix('api');

  // CORS — allow frontend origins (localhost, tunnel, etc.)
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Validation pipeline with security defaults
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Timing interceptor (only when explicitly enabled for performance measurement)
  if (process.env.ENABLE_TIMING_LOGS === 'true') {
    app.useGlobalInterceptors(new TimingInterceptor());
    Logger.log('⏱️  Timing logs enabled', 'Bootstrap');
  }

  // Serve uploaded files statically. Keep images viewable inline but prevent
  // MIME sniffing (defense in depth alongside upload-time magic-byte checks).
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
    setHeaders: (res: Response) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);

  Logger.log(`🚀 Backend running on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`📡 API prefix: /api`, 'Bootstrap');
}

bootstrap();

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { TRACK_PERFORMANCE_KEY } from '../decorators/track-performance.decorator';
import { Response, Request } from 'express';

@Injectable()
export class PerformanceTimingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('PerformanceTiming');
  private readonly enabled: boolean;

  constructor(private readonly reflector: Reflector) {
    const raw = (process.env.ENABLE_TIMING_LOGS || '').toLowerCase();
    this.enabled = ['true', '1', 'yes', 'on'].includes(raw);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (!this.enabled) {
      return next.handle();
    }

    const operation = this.reflector.get<string>(
      TRACK_PERFORMANCE_KEY,
      context.getHandler(),
    );

    if (!operation) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;
    const url = request.originalUrl || request.url || '';
    const normalizedRoute = url.split('?')[0];

    const t0 = process.hrtime.bigint();

    return next.handle().pipe(
      tap((responseBody) => {
        const durationNs = Number(process.hrtime.bigint() - t0);
        const durationMs = Math.round((durationNs / 1_000_000) * 100) / 100;
        const response = context.switchToHttp().getResponse<Response>();
        const statusCode = response.statusCode;

        const meta = this.extractMetadata(
          operation,
          request,
          responseBody,
        );

        this.logger.log(
          JSON.stringify({
            event: 'request_timing',
            operation,
            method,
            normalizedRoute,
            statusCode,
            success: true,
            durationMs,
            timestamp: new Date().toISOString(),
            ...meta,
          }),
        );
      }),
      catchError((err) => {
        const durationNs = Number(process.hrtime.bigint() - t0);
        const durationMs = Math.round((durationNs / 1_000_000) * 100) / 100;
        const statusCode =
          err instanceof HttpException ? err.getStatus() : 500;

        this.logger.log(
          JSON.stringify({
            event: 'request_timing',
            operation,
            method,
            normalizedRoute,
            statusCode,
            success: false,
            durationMs,
            timestamp: new Date().toISOString(),
          }),
        );

        return throwError(() => err);
      }),
    );
  }

  private extractMetadata(
    operation: string,
    request: Request,
    responseBody: any,
  ): Record<string, any> {
    const meta: Record<string, any> = {};

    const isPaginatedList = [
      'admin.employees.list',
      'admin.beneficiaries.list',
      'admin.selections.list',
    ].includes(operation);

    if (isPaginatedList) {
      const query: any = request.query || {};

      if (query.page !== undefined) {
        const page = Number(query.page);
        if (Number.isFinite(page)) meta.page = page;
      }
      if (query.pageSize !== undefined) {
        const pageSize = Number(query.pageSize);
        if (Number.isFinite(pageSize)) meta.pageSize = pageSize;
      }

      meta.hasSearch = !!(query.search && String(query.search) !== '');
      meta.hasCampaignFilter = !!query.campaignId;
      meta.hasStatusFilter = !!(query.status && String(query.status) !== '');

      if (
        responseBody &&
        responseBody.data &&
        Array.isArray(responseBody.data)
      ) {
        meta.resultCount = responseBody.data.length;
      } else if (Array.isArray(responseBody)) {
        meta.resultCount = responseBody.length;
      }
    }

    if (operation === 'public.gifts.compatible') {
      if (Array.isArray(responseBody)) {
        meta.resultCount = responseBody.length;
      }
    }

    if (operation === 'admin.import.employees-beneficiaries') {
      if (responseBody) {
        const ALLOWED = [
          'totalRows',
          'employeesCreated',
          'employeesUpdated',
          'beneficiariesCreated',
          'skippedRows',
          'errorCount',
        ];
        for (const key of ALLOWED) {
          if (typeof responseBody[key] === 'number') {
            meta[key] = responseBody[key];
          }
        }
      }
    }

    if (operation === 'admin.export.selections' || operation === 'admin.export.employees') {
      if (Buffer.isBuffer(responseBody)) {
        meta.fileSizeBytes = responseBody.length;
      }
    }

    return meta;
  }
}

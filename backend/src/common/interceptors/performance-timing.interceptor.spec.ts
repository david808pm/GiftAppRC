import {
  PerformanceTimingInterceptor,
} from './performance-timing.interceptor';
import { TrackPerformance } from '../decorators/track-performance.decorator';
import { TRACK_PERFORMANCE_KEY } from '../decorators/track-performance.decorator';
import { Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import { Test, TestingModule } from '@nestjs/testing';

function setEnv(value: string | undefined) {
  if (value === undefined) {
    delete process.env.ENABLE_TIMING_LOGS;
  } else {
    process.env.ENABLE_TIMING_LOGS = value;
  }
}

function createMockContext(opts: {
  operation?: string;
  method?: string;
  url?: string;
  query?: Record<string, any>;
  statusCode?: number;
}) {
  const method = opts.method || 'GET';
  const url = opts.url || '/api/admin/test';
  const query = opts.query || {};

  const response = {
    statusCode: opts.statusCode ?? 200,
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
    json: jest.fn(),
  };

  const request = {
    method,
    originalUrl: url,
    url,
    query,
  };

  const handler = opts.operation
    ? (() => {}) // placeholder, decorated later via Reflect
    : () => {};

  if (opts.operation) {
    Reflect.defineMetadata(TRACK_PERFORMANCE_KEY, opts.operation, handler);
  }

  const context = {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  };

  return { context, response, request, handler };
}

describe('PerformanceTimingInterceptor', () => {
  let reflector: Reflector;
  let loggerLogSpy: jest.SpyInstance;

  beforeEach(() => {
    reflector = new Reflector();
    loggerLogSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    loggerLogSpy.mockRestore();
    delete process.env.ENABLE_TIMING_LOGS;
  });

  function createInterceptor(): PerformanceTimingInterceptor {
    return new PerformanceTimingInterceptor(reflector);
  }

  function parseLoggedEvent(): any {
    const calls = loggerLogSpy.mock.calls;
    const matching = calls.find(
      (c: any[]) =>
        typeof c[0] === 'string' && c[0].includes('request_timing'),
    );
    if (!matching) return null;
    return JSON.parse(matching[0] as string);
  }

  // ── 1. Flag disabled ───────────────────────────────────

  it('should pass response through unchanged when flag is disabled', async () => {
    setEnv('false');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.auth.me',
    });

    const response = { ok: true };
    const result = await interceptor
      .intercept(context as any, { handle: () => of(response) })
      .toPromise();

    expect(result).toBe(response);
    expect(parseLoggedEvent()).toBeNull();
  });

  it('should pass error through unchanged when flag is disabled', async () => {
    setEnv('false');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.auth.me',
    });
    const error = new Error('Test error');

    await expect(
      interceptor
        .intercept(context as any, {
          handle: () => throwError(() => error),
        })
        .toPromise(),
    ).rejects.toBe(error);

    expect(parseLoggedEvent()).toBeNull();
  });

  // ── 2. Enabled success ─────────────────────────────────

  it('should emit exactly one timing event on success', async () => {
    setEnv('true');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.auth.me',
      method: 'GET',
      url: '/api/auth/me',
    });

    const response = { id: 1, name: 'test' };
    await interceptor
      .intercept(context as any, { handle: () => of(response) })
      .toPromise();

    const event = parseLoggedEvent();
    expect(event).not.toBeNull();
    expect(event.event).toBe('request_timing');
    expect(event.operation).toBe('admin.auth.me');
    expect(event.method).toBe('GET');
    expect(event.normalizedRoute).toBe('/api/auth/me');
    expect(event.success).toBe(true);
    expect(typeof event.durationMs).toBe('number');
    expect(event.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof event.timestamp).toBe('string');

    // response identity preserved
    const result = await interceptor
      .intercept(context as any, { handle: () => of(response) })
      .toPromise();
    expect(result).toBe(response);
  });

  // ── 3. HttpException → failure event ───────────────────

  it('should emit one failure event for HttpException', async () => {
    setEnv('1');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.auth.me',
      url: '/api/auth/me',
    });
    const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

    await expect(
      interceptor
        .intercept(context as any, {
          handle: () => throwError(() => exception),
        })
        .toPromise(),
    ).rejects.toBe(exception);

    const event = parseLoggedEvent();
    expect(event.success).toBe(false);
    expect(event.statusCode).toBe(403);

    // only one event
    const all = loggerLogSpy.mock.calls.filter(
      (c: any[]) =>
        typeof c[0] === 'string' && c[0].includes('request_timing'),
    );
    expect(all.length).toBe(1);
  });

  // ── 4. Unknown Error → 500 estimate ────────────────────

  it('should emit one failure event with statusCode 500 for unknown error', async () => {
    setEnv('yes');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.auth.me',
    });
    const error = new Error('Unknown crash');

    await expect(
      interceptor
        .intercept(context as any, {
          handle: () => throwError(() => error),
        })
        .toPromise(),
    ).rejects.toBe(error);

    const event = parseLoggedEvent();
    expect(event.success).toBe(false);
    expect(event.statusCode).toBe(500);
  });

  // ── 5. Paginated response metadata ─────────────────────

  it('should include page, pageSize, resultCount, filter booleans', async () => {
    setEnv('on');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.employees.list',
      url: '/api/admin/employees?page=2&pageSize=50&search=test&campaignId=1',
      query: { page: '2', pageSize: '50', search: 'test', campaignId: '1' },
    });

    const responseBody = {
      data: [{ id: 1 }, { id: 2 }, { id: 3 }],
      meta: { page: 2, pageSize: 50, total: 100, totalPages: 2 },
    };

    await interceptor
      .intercept(context as any, {
        handle: () => of(responseBody),
      })
      .toPromise();

    const event = parseLoggedEvent();
    expect(event.page).toBe(2);
    expect(event.pageSize).toBe(50);
    expect(event.resultCount).toBe(3);
    expect(event.hasSearch).toBe(true);
    expect(event.hasCampaignFilter).toBe(true);
    expect(event.hasStatusFilter).toBe(false);
  });

  it('should handle hasStatusFilter=true', async () => {
    setEnv('1');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.employees.list',
      query: { status: 'ACTIVE' },
    });

    await interceptor
      .intercept(context as any, {
        handle: () => of([{ id: 1 }]),
      })
      .toPromise();

    const event = parseLoggedEvent();
    expect(event.hasStatusFilter).toBe(true);
    expect(event.resultCount).toBe(1);
  });

  // ── 6. Compatible gifts resultCount ─────────────────────

  it('should include resultCount for compatible gifts', async () => {
    setEnv('true');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'public.gifts.compatible',
    });

    const gifts = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    await interceptor
      .intercept(context as any, { handle: () => of(gifts) })
      .toPromise();

    const event = parseLoggedEvent();
    expect(event.resultCount).toBe(4);
  });

  // ── 7. Import aggregates ───────────────────────────────

  it('should include allowed import aggregate fields', async () => {
    setEnv('true');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.import.employees-beneficiaries',
      method: 'POST',
    });

    const result = {
      totalRows: 500,
      employeesCreated: 480,
      employeesUpdated: 12,
      beneficiariesCreated: 1200,
      skippedRows: 20,
      errorCount: 5,
      errors: ['internal detail'], // should NOT appear
      warnings: ['warn detail'], // should NOT appear
    };

    await interceptor
      .intercept(context as any, { handle: () => of(result) })
      .toPromise();

    const event = parseLoggedEvent();
    expect(event.totalRows).toBe(500);
    expect(event.employeesCreated).toBe(480);
    expect(event.employeesUpdated).toBe(12);
    expect(event.beneficiariesCreated).toBe(1200);
    expect(event.skippedRows).toBe(20);
    expect(event.errorCount).toBe(5);

    // non-allowed keys excluded
    const keys = Object.keys(event);
    expect(keys).not.toContain('errors');
    expect(keys).not.toContain('warnings');
  });

  // ── 8. Export fileSizeBytes ─────────────────────────────

  it('should include fileSizeBytes when response is a Buffer', async () => {
    setEnv('true');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.export.selections',
    });

    const buffer = Buffer.alloc(10240);
    await interceptor
      .intercept(context as any, { handle: () => of(buffer) })
      .toPromise();

    const event = parseLoggedEvent();
    expect(event.fileSizeBytes).toBe(10240);
  });

  it('should NOT include fileSizeBytes when response is not a Buffer', async () => {
    setEnv('true');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.export.selections',
      method: 'GET',
    });

    await interceptor
      .intercept(context as any, { handle: () => of(undefined) })
      .toPromise();

    const event = parseLoggedEvent();
    expect(event.fileSizeBytes).toBeUndefined();
  });

  // ── 9. Privacy ──────────────────────────────────────────

  it('should NOT include sensitive values in timing log', async () => {
    setEnv('true');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.auth.me',
      url: '/api/auth/me',
    });

    const response = {
      id: 42,
      name: 'Admin User',
      email: 'admin@example.com',
      role: { id: 1, name: 'SUPER_ADMIN' },
      companyId: 5,
      company: { id: 5, name: 'Acme' },
    };

    await interceptor
      .intercept(context as any, { handle: () => of(response) })
      .toPromise();

    const event = parseLoggedEvent();
    const str = JSON.stringify(event);

    // No user/employee/company identifiers
    expect(event.id).toBeUndefined();
    expect(event.name).toBeUndefined();
    expect(event.email).toBeUndefined();
    expect(event.role).toBeUndefined();
    expect(event.companyId).toBeUndefined();
    expect(event.company).toBeUndefined();

    // No sensitive data
    expect(str).not.toContain('admin@example.com');
    expect(str).not.toContain('Admin User');
    expect(str).not.toContain('SUPER_ADMIN');
    expect(str).not.toContain('Acme');
  });

  it('should NOT include search text, IDs, or request body content', async () => {
    setEnv('true');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.employees.list',
      url: '/api/admin/employees',
      query: {
        search: 'john.doe@email.com',
        campaignId: '5',
        employeeId: '99',
      },
    });

    await interceptor
      .intercept(context as any, {
        handle: () => of({ data: [{ id: 1 }] }),
      })
      .toPromise();

    const event = parseLoggedEvent();
    const str = JSON.stringify(event);

    expect(str).not.toContain('john.doe@email.com');
    expect(str).not.toContain('john');
    expect(event.search).toBeUndefined();
    expect(event.campaignId).toBeUndefined();
    expect(event.employeeId).toBeUndefined();
    // only booleans
    expect(event.hasSearch).toBe(true);
    expect(event.hasCampaignFilter).toBe(true);
  });

  // ── 10. Duration is finite and >= 0 ─────────────────────

  it('should produce finite non-negative durationMs', async () => {
    setEnv('true');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.dashboard.stats',
    });

    await interceptor
      .intercept(context as any, {
        handle: () => of({ campaigns: 10 }),
      })
      .toPromise();

    const event = parseLoggedEvent();
    expect(Number.isFinite(event.durationMs)).toBe(true);
    expect(event.durationMs).toBeGreaterThanOrEqual(0);
  });

  // ── 11. Core-only operations: no extra metadata ─────────

  it('should NOT attach extra metadata for auth/me', async () => {
    setEnv('true');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.auth.me',
    });

    await interceptor
      .intercept(context as any, {
        handle: () => of({ id: 1, name: 'test' }),
      })
      .toPromise();

    const event = parseLoggedEvent();
    const core = [
      'event',
      'operation',
      'method',
      'normalizedRoute',
      'statusCode',
      'success',
      'durationMs',
      'timestamp',
    ];
    const extra = Object.keys(event).filter((k) => !core.includes(k));
    expect(extra).toHaveLength(0);
  });

  it('should NOT attach extra metadata for confirmation', async () => {
    setEnv('true');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'public.selection.confirm',
      method: 'POST',
    });

    await interceptor
      .intercept(context as any, {
        handle: () =>
          of({ ok: true, selection: { id: 1, items: [{ beneficiaryId: 10 }] } }),
      })
      .toPromise();

    const event = parseLoggedEvent();
    const core = [
      'event',
      'operation',
      'method',
      'normalizedRoute',
      'statusCode',
      'success',
      'durationMs',
      'timestamp',
    ];
    const extra = Object.keys(event).filter((k) => !core.includes(k));
    expect(extra).toHaveLength(0);
  });

  it('should NOT attach extra metadata for dashboard', async () => {
    setEnv('true');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.dashboard.stats',
    });

    await interceptor
      .intercept(context as any, {
        handle: () => of({ totalCampaigns: 10 }),
      })
      .toPromise();

    const event = parseLoggedEvent();
    const core = [
      'event',
      'operation',
      'method',
      'normalizedRoute',
      'statusCode',
      'success',
      'durationMs',
      'timestamp',
    ];
    const extra = Object.keys(event).filter((k) => !core.includes(k));
    expect(extra).toHaveLength(0);
  });

  // ── 12. Integration: all 9 operations have metadata ─────

  const ALL_OPERATIONS = [
    'admin.auth.me',
    'admin.dashboard.stats',
    'admin.employees.list',
    'admin.beneficiaries.list',
    'admin.selections.list',
    'public.gifts.compatible',
    'admin.import.employees-beneficiaries',
    'admin.export.selections',
    'public.selection.confirm',
  ];

  ALL_OPERATIONS.forEach((op) => {
    it(`should emit event for operation: ${op}`, async () => {
      setEnv('true');
      const interceptor = createInterceptor();
      const { context } = createMockContext({
        operation: op,
        method: op.includes('import') || op.includes('confirm') ? 'POST' : 'GET',
        statusCode: 200,
      });

      const response = op.includes('import')
        ? { totalRows: 1, employeesCreated: 1, employeesUpdated: 0, beneficiariesCreated: 1, skippedRows: 0, errorCount: 0 }
        : op === 'public.gifts.compatible'
          ? [{ id: 1 }]
          : { data: [] };

      await interceptor
        .intercept(context as any, {
          handle: () => of(response),
        })
        .toPromise();

      const event = parseLoggedEvent();
      expect(event).not.toBeNull();
      expect(event.operation).toBe(op);
    });
  });

  // ── 13. Duplicate prevention ────────────────────────────

  it('should emit NO event for unapproved endpoint (no metadata)', async () => {
    setEnv('true');
    const interceptor = createInterceptor();
    const { context } = createMockContext({}); // no operation metadata

    await interceptor
      .intercept(context as any, {
        handle: () => of({ ok: true }),
      })
      .toPromise();

    expect(parseLoggedEvent()).toBeNull();
  });

  it('should emit exactly one event per approved request', async () => {
    setEnv('true');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.dashboard.stats',
    });

    await interceptor
      .intercept(context as any, {
        handle: () => of({ campaigns: 5 }),
      })
      .toPromise();

    const events = loggerLogSpy.mock.calls.filter(
      (c: any[]) =>
        typeof c[0] === 'string' && c[0].includes('request_timing'),
    );
    expect(events.length).toBe(1);
  });

  // ── 14. Flag values ─────────────────────────────────────

  it('should handle undefined ENABLE_TIMING_LOGS as disabled', async () => {
    setEnv(undefined);
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.dashboard.stats',
    });

    await interceptor
      .intercept(context as any, {
        handle: () => of({ campaigns: 5 }),
      })
      .toPromise();

    expect(parseLoggedEvent()).toBeNull();
  });

  it('should handle "off" as disabled', async () => {
    setEnv('off');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.dashboard.stats',
    });

    await interceptor
      .intercept(context as any, {
        handle: () => of({ campaigns: 5 }),
      })
      .toPromise();

    expect(parseLoggedEvent()).toBeNull();
  });

  // ── 15. Response identity preserved ─────────────────────

  it('should return the exact same response object reference on success', async () => {
    setEnv('true');
    const interceptor = createInterceptor();
    const { context } = createMockContext({
      operation: 'admin.employees.list',
    });

    const response = { data: [{ id: 1 }], meta: {} };
    const result = await interceptor
      .intercept(context as any, { handle: () => of(response) })
      .toPromise();

    expect(result).toBe(response);
  });
});

import { HttpExceptionFilter } from './http-exception.filter';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

function createMockContext(url?: string) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status } as any;
  const request = { url: url || '/api/test', method: 'GET' } as any;
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as any;
  return { response, request, host, status, json };
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  function getResponseBody(mockFn: jest.Mock): any {
    const calls = mockFn.mock.calls;
    return calls[calls.length - 1][0];
  }

  // ── HttpException passthrough ─────────────────────────

  it('should pass through HttpException status and message', () => {
    const { host, status, json } = createMockContext();
    const exception = new HttpException('Custom error', HttpStatus.BAD_REQUEST);
    filter.catch(exception, host);
    expect(status).toHaveBeenCalledWith(400);
    expect(getResponseBody(json).message).toEqual(['Custom error']);
  });

  // ── P2002 → 409 ───────────────────────────────────────

  it('should map P2002 to 409 CONFLICT', () => {
    const { host, status, json } = createMockContext('/api/test');
    const error = new Prisma.PrismaClientKnownRequestError('Unique failed', {
      code: 'P2002',
      clientVersion: '6.0.0',
    });
    filter.catch(error, host);
    expect(status).toHaveBeenCalledWith(409);
    expect(getResponseBody(json).message).toEqual([
      'Ya existe un registro con estos datos.',
    ]);
  });

  // ── P2025 → 404 ───────────────────────────────────────

  it('should map P2025 to 404 NOT_FOUND', () => {
    const { host, status, json } = createMockContext('/api/test');
    const error = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: '6.0.0',
    });
    filter.catch(error, host);
    expect(status).toHaveBeenCalledWith(404);
    expect(getResponseBody(json).message).toEqual([
      'El registro solicitado no existe.',
    ]);
  });

  // ── P2003 → 400 ───────────────────────────────────────

  it('should map P2003 to 400 BAD_REQUEST', () => {
    const { host, status, json } = createMockContext('/api/test');
    const error = new Prisma.PrismaClientKnownRequestError('FK failed', {
      code: 'P2003',
      clientVersion: '6.0.0',
    });
    filter.catch(error, host);
    expect(status).toHaveBeenCalledWith(400);
    expect(getResponseBody(json).message).toEqual([
      'La operación no pudo completarse.',
    ]);
  });

  // ── P1001 → 503 ───────────────────────────────────────

  it('should map P1001 to 503 SERVICE_UNAVAILABLE', () => {
    const { host, status, json } = createMockContext('/api/test');
    const error = new Prisma.PrismaClientKnownRequestError('DB unreachable', {
      code: 'P1001',
      clientVersion: '6.0.0',
    });
    filter.catch(error, host);
    expect(status).toHaveBeenCalledWith(503);
    expect(getResponseBody(json).message).toEqual([
      'Servicio no disponible temporalmente. Intenta nuevamente.',
    ]);
  });

  // ── P2024 → 503 ───────────────────────────────────────

  it('should map P2024 to 503 SERVICE_UNAVAILABLE', () => {
    const { host, status, json } = createMockContext('/api/test');
    const error = new Prisma.PrismaClientKnownRequestError('Pool timeout', {
      code: 'P2024',
      clientVersion: '6.0.0',
    });
    filter.catch(error, host);
    expect(status).toHaveBeenCalledWith(503);
    expect(getResponseBody(json).message).toEqual([
      'Servicio no disponible temporalmente. Intenta nuevamente.',
    ]);
  });

  // ── Unknown P-code → 500 ──────────────────────────────

  it('should map unknown Prisma code to 500', () => {
    const { host, status, json } = createMockContext('/api/test');
    const error = new Prisma.PrismaClientKnownRequestError('Unknown error', {
      code: 'P9999',
      clientVersion: '6.0.0',
    });
    filter.catch(error, host);
    expect(status).toHaveBeenCalledWith(500);
    expect(getResponseBody(json).message).toEqual([
      'Error interno del servidor.',
    ]);
  });

  // ── Generic Error → 500 ───────────────────────────────

  it('should map generic Error to 500', () => {
    const { host, status, json } = createMockContext('/api/test');
    filter.catch(new Error('Something broke'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(getResponseBody(json).message).toEqual([
      'Error interno del servidor.',
    ]);
  });

  // ── No Prisma details leaked ──────────────────────────

  it('should NOT expose Prisma error code or details in response', () => {
    const { host, json } = createMockContext('/api/test');
    const error = new Prisma.PrismaClientKnownRequestError(
      'Internal detail: table "X" constraint "Y"',
      {
        code: 'P1001',
        clientVersion: '6.0.0',
        meta: { target: ['email'] },
      },
    );
    filter.catch(error, host);
    const body = getResponseBody(json);
    const bodyStr = JSON.stringify(body).toLowerCase();
    expect(bodyStr).not.toContain('p1001');
    expect(bodyStr).not.toContain('prisma');
    expect(bodyStr).not.toContain('constraint');
    expect(bodyStr).not.toContain('table');
    expect(bodyStr).not.toContain('clientversion');
    expect(bodyStr).not.toContain('meta');
  });

  // ── Response shape includes timestamp and path ─────────

  it('should include timestamp and path in response', () => {
    const { host, json } = createMockContext('/api/test/path');
    const error = new Prisma.PrismaClientKnownRequestError('', {
      code: 'P2002',
      clientVersion: '6.0.0',
    });
    filter.catch(error, host);
    const body = getResponseBody(json);
    expect(body.statusCode).toBe(409);
    expect(body.path).toBe('/api/test/path');
    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe('string');
  });

  // ── P2007 → 400 (data validation error) ───────────────

  it('should map P2007 to 400 BAD_REQUEST', () => {
    const { host, status } = createMockContext('/api/test');
    const error = new Prisma.PrismaClientKnownRequestError('Data validation', {
      code: 'P2007',
      clientVersion: '6.0.0',
    });
    filter.catch(error, host);
    expect(status).toHaveBeenCalledWith(400);
  });

  // ── P2014 → 400 (invalid relation) ────────────────────

  it('should map P2014 to 400 BAD_REQUEST', () => {
    const { host, status } = createMockContext('/api/test');
    const error = new Prisma.PrismaClientKnownRequestError('Invalid relation', {
      code: 'P2014',
      clientVersion: '6.0.0',
    });
    filter.catch(error, host);
    expect(status).toHaveBeenCalledWith(400);
  });
});

describe('HttpExceptionFilter mock context helpers — coverage for getResponseBody access', () => {
  const filter = new HttpExceptionFilter();

  it('should handle HttpException with object response', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status } as any),
        getRequest: () => ({ url: '/', method: 'GET' } as any),
      }),
    } as any;
    const ex = new HttpException({ message: 'Obj error' }, 422);
    filter.catch(ex, host);
    expect(status).toHaveBeenCalledWith(422);
  });
});

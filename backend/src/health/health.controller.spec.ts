import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { HttpStatus } from '@nestjs/common';

function createMockPrisma() {
  return {
    $queryRaw: jest.fn(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
}

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: HealthService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    healthService = new HealthService(mockPrisma as any);
    controller = new HealthController(healthService);
  });

  // ── Liveness ────────────────────────────────────────────

  describe('GET /api/health/live', () => {
    it('should return status ok with live=true and valid ISO timestamp', () => {
      const result = controller.live();

      expect(result.status).toBe('ok');
      expect(result.live).toBe(true);
      expect(typeof result.timestamp).toBe('string');
      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });

  // ── Readiness success ───────────────────────────────────

  describe('GET /api/health/ready', () => {
    it('should return ready=true when Prisma SELECT 1 succeeds', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const json = jest.fn();
      const status = jest.fn().mockReturnValue({ json });
      const res = { status, json } as any;

      await controller.ready(res);

      expect(status).toHaveBeenCalledWith(HttpStatus.OK);
      const body = json.mock.calls[0][0];
      expect(body.status).toBe('ok');
      expect(body.ready).toBe(true);
      expect(typeof body.timestamp).toBe('string');
      expect(() => new Date(body.timestamp)).not.toThrow();
    });
  });

  // ── Readiness DB failure ────────────────────────────────

  describe('GET /api/health/ready — DB failure', () => {
    it('should return 503 when Prisma query rejects', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));

      const json = jest.fn();
      const status = jest.fn().mockReturnValue({ json });
      const res = { status, json } as any;

      await controller.ready(res);

      expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      const body = json.mock.calls[0][0];
      expect(body.status).toBe('error');
      expect(body.ready).toBe(false);
      expect(typeof body.timestamp).toBe('string');

      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).not.toContain('connection');
      expect(bodyStr).not.toContain('refused');
      expect(bodyStr).not.toContain('prisma');
      expect(bodyStr).not.toContain('host');
    });
  });

  // ── Readiness timeout ───────────────────────────────────

  describe('GET /api/health/ready — timeout', () => {
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('should return 503 when Prisma query exceeds 2-second timeout', async () => {
      jest.useFakeTimers();

      mockPrisma.$queryRaw.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve([{ '?column?': 1 }]), 5000),
          ),
      );

      const json = jest.fn();
      const status = jest.fn().mockReturnValue({ json });
      const res = { status, json } as any;

      const readyPromise = controller.ready(res);

      jest.advanceTimersByTime(2100);
      await readyPromise;

      expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      const body = json.mock.calls[0][0];
      expect(body.status).toBe('error');
      expect(body.ready).toBe(false);

      jest.useRealTimers();
    });
  });

  // ── Version endpoint ────────────────────────────────────

  describe('GET /api/health/version', () => {
    it('should return name, version, commit, buildDate, environment', () => {
      const result = controller.version();

      expect(result.status).toBe('ok');
      expect(result.name).toBe('giftapp-backend');
      expect(result.version).toBe('1.0.0');
      expect(typeof result.commit).toBe('string');
      expect(typeof result.buildDate).toBe('string');
      expect(typeof result.environment).toBe('string');
    });

    it('should use APP_COMMIT env when present', () => {
      process.env.APP_COMMIT = 'abc123def';
      const service = new HealthService(mockPrisma as any);
      const ctrl = new HealthController(service);

      const result = ctrl.version();
      expect(result.commit).toBe('abc123def');

      delete process.env.APP_COMMIT;
    });

    it('should fall back to GIT_COMMIT when APP_COMMIT is not set', () => {
      delete process.env.APP_COMMIT;
      process.env.GIT_COMMIT = 'git789xyz';
      const service = new HealthService(mockPrisma as any);
      const ctrl = new HealthController(service);

      const result = ctrl.version();
      expect(result.commit).toBe('git789xyz');

      delete process.env.GIT_COMMIT;
    });

    it('should return unknown when neither APP_COMMIT nor GIT_COMMIT is set', () => {
      delete process.env.APP_COMMIT;
      delete process.env.GIT_COMMIT;
      const service = new HealthService(mockPrisma as any);
      const ctrl = new HealthController(service);

      const result = ctrl.version();
      expect(result.commit).toBe('unknown');
    });

    it('should use BUILD_DATE env when present', () => {
      process.env.BUILD_DATE = '2026-07-13T12:00:00Z';
      const service = new HealthService(mockPrisma as any);
      const ctrl = new HealthController(service);

      const result = ctrl.version();
      expect(result.buildDate).toBe('2026-07-13T12:00:00Z');

      delete process.env.BUILD_DATE;
    });

    it('should return unknown when BUILD_DATE is not set', () => {
      delete process.env.BUILD_DATE;
      const service = new HealthService(mockPrisma as any);
      const ctrl = new HealthController(service);

      const result = ctrl.version();
      expect(result.buildDate).toBe('unknown');
    });

    it('should NOT expose sensitive environment variables', () => {
      process.env.DATABASE_URL = 'postgresql://secret@db:5432/test';
      process.env.JWT_SECRET = 'super-secret-jwt-key';
      process.env.RESEND_API_KEY = 're_secret_key';
      process.env.SUPABASE_URL = 'https://secret.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret-role-key';

      const service = new HealthService(mockPrisma as any);
      const ctrl = new HealthController(service);
      const result = ctrl.version();
      const bodyStr = JSON.stringify(result).toLowerCase();

      expect(bodyStr).not.toContain('database_url');
      expect(bodyStr).not.toContain('jwt_secret');
      expect(bodyStr).not.toContain('resend');
      expect(bodyStr).not.toContain('supabase');
      expect(bodyStr).not.toContain('secret');
      expect(bodyStr).not.toContain('password');
      expect(bodyStr).not.toContain('postgresql:');

      delete process.env.DATABASE_URL;
      delete process.env.JWT_SECRET;
      delete process.env.RESEND_API_KEY;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    });

    it('should fallback environment to development when NODE_ENV is unset', () => {
      delete process.env.NODE_ENV;
      const service = new HealthService(mockPrisma as any);
      const ctrl = new HealthController(service);

      const result = ctrl.version();
      expect(result.environment).toBe('development');
    });
  });
});

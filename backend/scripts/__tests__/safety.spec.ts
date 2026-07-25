import { assertSafeTarget, classifyEndpoint } from '../lib/safety';

describe('assertSafeTarget', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ALLOW_REMOTE_BENCHMARK;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('allows localhost', () => {
    expect(() => assertSafeTarget('http://localhost:3001')).not.toThrow();
    expect(() => assertSafeTarget('http://127.0.0.1:3001')).not.toThrow();
    expect(() => assertSafeTarget('http://[::1]:3001')).not.toThrow();
  });

  it('rejects known production host exact match', () => {
    expect(() => assertSafeTarget('https://giftapp.com')).toThrow(/BENCHMARK_SAFETY/);
  });

  it('rejects known production pattern match', () => {
    expect(() => assertSafeTarget('https://myapp.herokuapp.com')).toThrow(/BENCHMARK_SAFETY/);
    expect(() => assertSafeTarget('https://myapp.onrender.com')).toThrow(/BENCHMARK_SAFETY/);
  });

  it('rejects unknown remote host without ALLOW_REMOTE_BENCHMARK', () => {
    expect(() => assertSafeTarget('https://staging.example.com')).toThrow(
      /BENCHMARK_SAFETY/,
    );
  });

  it('allows unknown remote host with ALLOW_REMOTE_BENCHMARK=true', () => {
    process.env.ALLOW_REMOTE_BENCHMARK = 'true';
    expect(() => assertSafeTarget('https://staging.example.com')).not.toThrow();
  });

  it('allows unknown remote host with ALLOW_REMOTE_BENCHMARK=1', () => {
    process.env.ALLOW_REMOTE_BENCHMARK = '1';
    expect(() => assertSafeTarget('https://staging.example.com')).not.toThrow();
  });

  it('rejects invalid URL', () => {
    expect(() => assertSafeTarget('not-a-url')).toThrow(/invalid url/i);
  });

  it('rejects production host even with ALLOW_REMOTE_BENCHMARK=true', () => {
    process.env.ALLOW_REMOTE_BENCHMARK = 'true';
    expect(() => assertSafeTarget('https://giftapp.com')).toThrow(/BENCHMARK_SAFETY/);
    expect(() => assertSafeTarget('https://myapp.herokuapp.com')).toThrow(/BENCHMARK_SAFETY/);
  });

  it('case insensitive hostname', () => {
    expect(() => assertSafeTarget('http://LOCALHOST:3001')).not.toThrow();
  });
});

describe('classifyEndpoint', () => {
  it('classifies health endpoints as read-only', () => {
    expect(classifyEndpoint('GET', '/api/health/live')).toBe('read-only');
    expect(classifyEndpoint('GET', '/api/health/ready')).toBe('read-only');
    expect(classifyEndpoint('GET', '/api/health/version')).toBe('read-only');
  });

  it('classifies non-GET as unknown', () => {
    expect(classifyEndpoint('POST', '/api/health/live')).toBe('unknown');
    expect(classifyEndpoint('PUT', '/api/health/live')).toBe('unknown');
    expect(classifyEndpoint('DELETE', '/api/health/live')).toBe('unknown');
  });

  it('classifies mutation-path as unknown even for GET', () => {
    expect(classifyEndpoint('GET', '/api/admin/import')).toBe('unknown');
    expect(classifyEndpoint('GET', '/api/confirm')).toBe('unknown');
    expect(classifyEndpoint('GET', '/api/admin/export')).toBe('unknown');
    expect(classifyEndpoint('GET', '/api/admin/gifts/upload')).toBe('unknown');
  });

  it('classifies GET /api/* as read-only (fallback)', () => {
    expect(classifyEndpoint('GET', '/api/admin/campaigns')).toBe('read-only');
    expect(classifyEndpoint('GET', '/api/admin/employees')).toBe('read-only');
    expect(classifyEndpoint('GET', '/api/admin/employees?page=1&pageSize=10')).toBe('read-only');
    expect(classifyEndpoint('GET', '/api/public/campaigns/tigo-2026')).toBe('read-only');
  });

  it('classifies non-api paths as unknown', () => {
    expect(classifyEndpoint('GET', '/health')).toBe('unknown');
    expect(classifyEndpoint('GET', '/')).toBe('unknown');
  });
});

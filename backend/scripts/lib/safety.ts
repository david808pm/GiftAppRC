const PRODUCTION_HOST_PATTERNS: RegExp[] = [
  /\.netlify\.app$/,
  /\.vercel\.app$/,
  /\.fly\.dev$/,
  /render\.com$/,
  /onrender\.com$/,
  /railway\.app$/,
  /\.herokuapp\.com$/,
];

const PRODUCTION_HOST_EXACT: string[] = [
  'giftapp.com',
  'api.giftapp.com',
  'mimo-regalos.com',
  'api.mimo-regalos.com',
];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function assertSafeTarget(baseUrl: string): void {
  let hostname: string;

  try {
    const parsed = new URL(baseUrl);
    hostname = parsed.hostname.toLowerCase();
  } catch {
    throw new Error(`BENCHMARK_SAFETY: Invalid URL "${baseUrl}"`);
  }

  if (LOCAL_HOSTS.has(hostname)) {
    return;
  }

  for (const pattern of PRODUCTION_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(
        `BENCHMARK_SAFETY: Refusing to run against potential production host "${hostname}". ` +
          `Set ALLOW_REMOTE_BENCHMARK=true to override.`,
      );
    }
  }

  for (const exact of PRODUCTION_HOST_EXACT) {
    if (hostname === exact) {
      throw new Error(
        `BENCHMARK_SAFETY: Refusing to run against known production host "${hostname}". ` +
          `Set ALLOW_REMOTE_BENCHMARK=true to override.`,
      );
    }
  }

  const allowRemote = (process.env.ALLOW_REMOTE_BENCHMARK || '').toLowerCase();
  if (!['true', '1', 'yes', 'on'].includes(allowRemote)) {
    throw new Error(
      `BENCHMARK_SAFETY: Target "${hostname}" is not localhost. ` +
        `Set ALLOW_REMOTE_BENCHMARK=true to run against remote targets.`,
    );
  }
}

const READONLY_ROUTES = [
  { method: 'GET', path: '/api/health/live' },
  { method: 'GET', path: '/api/health/ready' },
  { method: 'GET', path: '/api/health/version' },
  { method: 'GET', path: '/api/public/campaigns/' },
];

const MUTATION_ROUTES = [
  { method: 'POST', path: 'import' },
  { method: 'POST', path: 'confirm' },
  { method: 'POST', path: 'export' },
  { method: 'POST', path: 'upload' },
];

export function classifyEndpoint(
  method: string,
  path: string,
): 'read-only' | 'mutation' | 'unknown' {
  const upperMethod = method.toUpperCase();

  if (upperMethod !== 'GET') {
    return 'unknown';
  }

  const normalized = path.toLowerCase();

  for (const m of MUTATION_ROUTES) {
    if (normalized.includes(m.path.toLowerCase())) {
      return 'unknown';
    }
  }

  for (const r of READONLY_ROUTES) {
    if (
      r.method === upperMethod &&
      normalized.startsWith(r.path.toLowerCase())
    ) {
      return 'read-only';
    }
  }

  if (normalized.startsWith('/api/') && upperMethod === 'GET') {
    return 'read-only';
  }

  return 'unknown';
}

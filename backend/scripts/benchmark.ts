#!/usr/bin/env npx ts-node

import * as fs from 'fs';
import * as path from 'path';
import { assertSafeTarget } from './lib/safety';
import {
  benchmarkSuite,
  EndpointDefinition,
  BenchmarkReport,
} from './lib/runner';

interface BenchmarkConfig {
  baseUrl: string;
  iterations: number;
  warmupIterations: number;
  adminEmail: string;
  adminPassword: string;
}

function loadConfig(): BenchmarkConfig {
  return {
    baseUrl: process.env.BENCHMARK_API_URL || 'http://localhost:3001',
    iterations: parseInt(process.env.BENCHMARK_ITERATIONS || '10', 10),
    warmupIterations: parseInt(process.env.BENCHMARK_WARMUP || '3', 10),
    adminEmail: process.env.ADMIN_EMAIL || 'admin@giftapp.com',
    adminPassword: process.env.ADMIN_PASSWORD || 'Admin123!',
  };
}

async function authenticate(
  baseUrl: string,
  email: string,
  password: string,
): Promise<string> {
  const url = `${baseUrl}/api/auth/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Authentication failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const token = data.accessToken || data.token;

  if (!token) {
    throw new Error('No access token in login response');
  }

  return token;
}

async function discoverCampaignSlug(
  baseUrl: string,
  token: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/api/admin/campaigns`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const campaigns = Array.isArray(data) ? data : data.data;
    if (campaigns && campaigns.length > 0 && campaigns[0].slug) {
      return campaigns[0].slug;
    }
    return null;
  } catch {
    return null;
  }
}

function buildEndpointSuite(token: string, campaignSlug: string | null): EndpointDefinition[] {
  const authHeaders = { Authorization: `Bearer ${token}` };

  const endpoints: EndpointDefinition[] = [
    { name: 'health.live', method: 'GET', path: '/api/health/live' },
    { name: 'health.ready', method: 'GET', path: '/api/health/ready' },
    { name: 'health.version', method: 'GET', path: '/api/health/version' },
    { name: 'admin.auth.me', method: 'GET', path: '/api/auth/me', headers: { ...authHeaders } },
    { name: 'admin.dashboard.stats', method: 'GET', path: '/api/admin/dashboard/stats', headers: { ...authHeaders } },
    { name: 'admin.campaigns.list', method: 'GET', path: '/api/admin/campaigns', headers: { ...authHeaders } },
    { name: 'admin.employees.list', method: 'GET', path: '/api/admin/employees', headers: { ...authHeaders } },
    { name: 'admin.employees.paginated', method: 'GET', path: '/api/admin/employees?page=1&pageSize=10', headers: { ...authHeaders } },
    { name: 'admin.beneficiaries.list', method: 'GET', path: '/api/admin/beneficiaries', headers: { ...authHeaders } },
    { name: 'admin.beneficiaries.paginated', method: 'GET', path: '/api/admin/beneficiaries?page=1&pageSize=10', headers: { ...authHeaders } },
    { name: 'admin.gifts.list', method: 'GET', path: '/api/admin/gifts', headers: { ...authHeaders } },
    { name: 'admin.selections.list', method: 'GET', path: '/api/admin/selections', headers: { ...authHeaders } },
    { name: 'admin.selections.paginated', method: 'GET', path: '/api/admin/selections?page=1&pageSize=10', headers: { ...authHeaders } },
    { name: 'admin.support-requests.list', method: 'GET', path: '/api/admin/support-requests', headers: { ...authHeaders } },
    { name: 'admin.companies.list', method: 'GET', path: '/api/admin/companies', headers: { ...authHeaders } },
    { name: 'admin.users.list', method: 'GET', path: '/api/admin/users', headers: { ...authHeaders } },
  ];

  if (campaignSlug) {
    endpoints.push({
      name: 'public.campaign.by-slug',
      method: 'GET',
      path: `/api/public/campaigns/${campaignSlug}`,
    });
  }

  return endpoints;
}

async function healthPreCheck(baseUrl: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/api/health/live`);
    if (!res.ok) {
      throw new Error(`Health endpoint returned ${res.status}`);
    }
    console.log('✓ Health check passed\n');
  } catch (err) {
    throw new Error(
      `Cannot reach backend at ${baseUrl}/api/health/live — is it running?\n` +
        `  Start with: cd backend && npm run start:dev\n` +
        `  Error: ${err}`,
    );
  }
}

async function main() {
  console.log('=== GiftApp Performance Benchmark ===\n');

  const config = loadConfig();

  console.log(`Target:        ${config.baseUrl}`);
  console.log(`Iterations:    ${config.iterations}`);
  console.log(`Warmup:        ${config.warmupIterations}`);
  console.log(`Node:          ${process.version}\n`);

  assertSafeTarget(config.baseUrl);
  console.log('✓ Safety check passed\n');

  await healthPreCheck(config.baseUrl);

  console.log('Authenticating...');
  const token = await authenticate(
    config.baseUrl,
    config.adminEmail,
    config.adminPassword,
  );
  console.log('✓ Authenticated\n');

  const campaignSlug = await discoverCampaignSlug(config.baseUrl, token);
  if (campaignSlug) {
    console.log(`✓ Found campaign slug: ${campaignSlug}\n`);
  } else {
    console.log('⚠ No campaigns found — skipping public campaign endpoint\n');
  }

  const endpoints = buildEndpointSuite(token, campaignSlug);

  console.log(`Endpoints to benchmark: ${endpoints.length}\n`);

  const report: BenchmarkReport = await benchmarkSuite({
    endpoints,
    baseUrl: config.baseUrl,
    iterations: config.iterations,
    warmupIterations: config.warmupIterations,
  });

  const resultsDir = path.join(__dirname, '..', 'benchmark-results');
  await fs.promises.mkdir(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `baseline-${timestamp}.json`;
  const filepath = path.join(resultsDir, filename);

  await fs.promises.writeFile(filepath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nReport saved: ${filepath}`);

  printSummary(report);
}

function printSummary(report: BenchmarkReport) {
  console.log('\n=== BASELINE SUMMARY ===\n');
  console.log('Endpoint'.padEnd(40) + 'p50(ms)'.padStart(10) + 'p95(ms)'.padStart(10) + 'mean(ms)'.padStart(10));
  console.log('-'.repeat(70));

  for (const ep of report.endpoints) {
    const name = ep.name.slice(0, 38).padEnd(40);
    const p50 = String(ep.warm.p50).padStart(10);
    const p95 = String(ep.warm.p95).padStart(10);
    const avg = String(ep.warm.mean).padStart(10);
    console.log(`${name}${p50}${p95}${avg}`);
  }

  console.log('\n✓ Benchmark complete.');
  console.log('  No optimizations performed — phase C: measure only.\n');
}

main().catch((err) => {
  console.error(`\n✗ Benchmark failed: ${err.message}`);
  process.exit(1);
});

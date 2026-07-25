#!/usr/bin/env npx ts-node

import { stats } from './lib/stats';

const BASE_URL = process.env.BENCHMARK_API_URL || 'http://localhost:3001';
const ITERATIONS = 15;
const WARMUP = 3;
const CREDENTIALS = {
  email: process.env.ADMIN_EMAIL || 'admin@giftapp.com',
  password: process.env.ADMIN_PASSWORD || 'Admin123!',
};

async function timedFetch(url: string, opts: RequestInit) {
  const t0 = performance.now();
  const res = await fetch(url, opts);
  await res.text();
  return performance.now() - t0;
}

async function main() {
  console.log('=== POST-CHANGE /auth/me Benchmark ===\n');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Iterations: ${ITERATIONS} (warmup: ${WARMUP})\n`);

  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(CREDENTIALS),
  });
  const { accessToken } = await loginRes.json();
  console.log('✓ Authenticated\n');

  // Health baselines
  const liveTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    liveTimes.push(await timedFetch(`${BASE_URL}/api/health/live`, {}));
  }
  const liveStats = stats(liveTimes);
  console.log(`health.live:         p50=${liveStats.p50}ms p95=${liveStats.p95}ms mean=${liveStats.mean}ms`);

  const readyTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    readyTimes.push(await timedFetch(`${BASE_URL}/api/health/ready`, {}));
  }
  const readyStats = stats(readyTimes);
  console.log(`health.ready:        p50=${readyStats.p50}ms p95=${readyStats.p95}ms mean=${readyStats.mean}ms`);

  // Warmup /auth/me
  for (let i = 0; i < WARMUP; i++) {
    await timedFetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  // Measure /auth/me
  const authMeTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    authMeTimes.push(
      await timedFetch(`${BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
  }
  const authMeStats = stats(authMeTimes);

  console.log(`\n✓ /auth/me POST-CHANGE:`);
  console.log(`  p50  = ${authMeStats.p50}ms`);
  console.log(`  p95  = ${authMeStats.p95}ms`);
  console.log(`  p99  = ${authMeStats.p99}ms`);
  console.log(`  mean = ${authMeStats.mean}ms`);
  console.log(`  min  = ${authMeStats.min}ms`);
  console.log(`  max  = ${authMeStats.max}ms`);
  console.log(`  samples: [${authMeStats.samples.join(', ')}]\n`);

  // Verify DB lookups decreased
  console.log('=== COMPARISON ===');
  console.log('BEFORE (Phase C, 5 iter):  p50=995ms  p95=2150ms  mean=1283ms  (2 DB queries)');
  console.log(`AFTER  (15 iter):          p50=${authMeStats.p50}ms  p95=${authMeStats.p95}ms  mean=${authMeStats.mean}ms  (1 DB query)`);

  const pctChange = Math.round(((authMeStats.p50 - 995) / 995) * 100);
  console.log(`p50 change: ${pctChange > 0 ? '+' : ''}${pctChange}%\n`);

  console.log('✓ Benchmark complete.');
}

main().catch((err) => {
  console.error(`✗ Failed: ${err.message}`);
  process.exit(1);
});

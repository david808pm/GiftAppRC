#!/usr/bin/env npx ts-node

import { PrismaClient } from '@prisma/client';

const ITERATIONS = 8;
const WARMUP = 3;

interface Measurement {
  name: string;
  description: string;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  min: number;
  max: number;
  count: number;
  samples: number[];
}

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (pct / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (1 - (idx - lo)) + sorted[hi] * (idx - lo);
}

function stats(values: number[]): Omit<Measurement, 'name' | 'description'> {
  if (values.length === 0) {
    return { p50: NaN, p95: NaN, p99: NaN, mean: NaN, min: NaN, max: NaN, count: 0, samples: [] };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    p50: Math.round(percentile(values, 50) * 100) / 100,
    p95: Math.round(percentile(values, 95) * 100) / 100,
    p99: Math.round(percentile(values, 99) * 100) / 100,
    mean: Math.round((sum / values.length) * 100) / 100,
    min: Math.round(sorted[0] * 100) / 100,
    max: Math.round(sorted[sorted.length - 1] * 100) / 100,
    count: values.length,
    samples: values.map((v) => Math.round(v * 100) / 100),
  };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ durationMs: number; result: T }> {
  const t0 = performance.now();
  const result = await fn();
  return { durationMs: Math.round((performance.now() - t0) * 100) / 100, result };
}

async function measure(
  name: string,
  description: string,
  fn: () => Promise<any>,
  prisma: PrismaClient,
  iterations: number,
): Promise<Measurement> {
  for (let i = 0; i < WARMUP; i++) {
    try {
      await fn();
    } catch {}
  }

  const durations: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const { durationMs } = await timed(fn);
    durations.push(durationMs);
  }

  return { name, description, ...stats(durations) };
}

async function main() {
  console.log('=== GiftApp DB Latency Diagnostic ===\n');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set in environment.');
    process.exit(1);
  }

  const masked = databaseUrl.replace(/\/\/.*@/, '//***:***@');
  console.log(`DB: ${masked}`);
  console.log(`Iterations: ${ITERATIONS} (warmup: ${WARMUP})`);
  console.log(`Node: ${process.version}\n`);

  const prisma = new PrismaClient({ log: ['error'] });

  try {
    await prisma.$connect();
    console.log('✓ Connected to database\n');

    const results: Measurement[] = [];

    // 1. Raw network round-trip
    results.push(
      await measure(
        'db.raw.select-1',
        'SELECT 1 — pure network + query overhead (minimum possible round-trip)',
        () => prisma.$queryRawUnsafe('SELECT 1'),
        prisma,
        ITERATIONS,
      ),
    );

    // 2. JWT strategy query (findUnique by id with role include)
    results.push(
      await measure(
        'db.jwt.validate',
        'adminUser.findUnique(id, include role) — JwtStrategy.validate() cost',
        async () => {
          const users = await prisma.adminUser.findMany({ select: { id: true }, take: 1 });
          if (users.length === 0) return null;
          return prisma.adminUser.findUnique({
            where: { id: users[0].id },
            include: { role: { select: { name: true } } },
          });
        },
        prisma,
        ITERATIONS,
      ),
    );

    // 3. Auth me query (findUnique by id with role + company include)
    results.push(
      await measure(
        'db.auth.me',
        'adminUser.findUnique(id, include role + company) — /api/auth/me query',
        async () => {
          const users = await prisma.adminUser.findMany({ select: { id: true }, take: 1 });
          if (users.length === 0) return null;
          return prisma.adminUser.findUnique({
            where: { id: users[0].id },
            include: {
              role: true,
              company: { select: { id: true, name: true, slug: true } },
            },
          });
        },
        prisma,
        ITERATIONS,
      ),
    );

    // 4. Simple count
    results.push(
      await measure(
        'db.count.campaigns',
        'campaign.count({ deletedAt: null }) — single aggregate',
        () => prisma.campaign.count({ where: { deletedAt: null } }),
        prisma,
        ITERATIONS,
      ),
    );

    // 5. Employee count with campaign filter
    results.push(
      await measure(
        'db.count.employees',
        'employee.count({ deletedAt: null, campaign: { deletedAt: null } })',
        () =>
          prisma.employee.count({
            where: { deletedAt: null, campaign: { deletedAt: null } },
          }),
        prisma,
        ITERATIONS,
      ),
    );

    // 6. Campaign findMany (like admin.campaigns.list)
    results.push(
      await measure(
        'db.findMany.campaigns',
        'campaign.findMany({ include company, _count }) — ~admin.campaigns.list',
        () =>
          prisma.campaign.findMany({
            where: { deletedAt: null },
            include: {
              company: { select: { id: true, name: true, slug: true } },
              _count: { select: { employees: true, gifts: true } },
            },
          }),
        prisma,
        ITERATIONS,
      ),
    );

    // 7. Employee findMany with relations (like admin.employees.list unpaginated)
    results.push(
      await measure(
        'db.findMany.employees-all',
        'employee.findMany(include campaign) — all rows, ~admin.employees.list',
        () =>
          prisma.employee.findMany({
            where: { deletedAt: null, campaign: { deletedAt: null } },
            include: {
              campaign: { select: { id: true, name: true, slug: true } },
              createdBy: { select: { id: true, name: true, email: true } },
              updatedBy: { select: { id: true, name: true, email: true } },
            },
          }),
        prisma,
        ITERATIONS,
      ),
    );

    // 8. Employee findMany paginated (like admin.employees.list with page=1, pageSize=10)
    results.push(
      await measure(
        'db.findMany.employees-10',
        'employee.findMany(skip=0, take=10, include campaign) — paginated 10 rows',
        () =>
          prisma.employee.findMany({
            where: { deletedAt: null, campaign: { deletedAt: null } },
            include: {
              campaign: { select: { id: true, name: true, slug: true } },
              createdBy: { select: { id: true, name: true, email: true } },
              updatedBy: { select: { id: true, name: true, email: true } },
            },
            skip: 0,
            take: 10,
          }),
        prisma,
        ITERATIONS,
      ),
    );

    // 9. Employee count (for paginated total)
    results.push(
      await measure(
        'db.count.employees-filtered',
        'employee.count({ deletedAt: null, campaign deletedAt: null }) — pagination total',
        () =>
          prisma.employee.count({
            where: { deletedAt: null, campaign: { deletedAt: null } },
          }),
        prisma,
        ITERATIONS,
      ),
    );

    // 10. Beneficiary findMany with includes — all rows
    results.push(
      await measure(
        'db.findMany.beneficiaries-all',
        'beneficiary.findMany(include employee.campaign) — all rows',
        () =>
          prisma.beneficiary.findMany({
            where: { deletedAt: null, employee: { deletedAt: null, campaign: { deletedAt: null } } },
            include: {
              employee: {
                select: {
                  id: true,
                  fullName: true,
                  documentId: true,
                  campaign: { select: { id: true, name: true, slug: true } },
                },
              },
            },
          }),
        prisma,
        ITERATIONS,
      ),
    );

    // 11. Beneficiary findMany paginated
    results.push(
      await measure(
        'db.findMany.beneficiaries-10',
        'beneficiary.findMany(skip=0, take=10) — paginated 10 rows',
        () =>
          prisma.beneficiary.findMany({
            where: { deletedAt: null, employee: { deletedAt: null, campaign: { deletedAt: null } } },
            include: {
              employee: {
                select: {
                  id: true,
                  fullName: true,
                  documentId: true,
                  campaign: { select: { id: true, name: true, slug: true } },
                },
              },
            },
            skip: 0,
            take: 10,
          }),
        prisma,
        ITERATIONS,
      ),
    );

    // 12. Campaign by slug (like public.campaign.by-slug)
    results.push(
      await measure(
        'db.findUnique.campaign-by-slug',
        'campaign.findUnique({ slug, include company, employees, gifts }) — public endpoint',
        async () => {
          const campaigns = await prisma.campaign.findFirst({
            where: { deletedAt: null },
            select: { slug: true },
          });
          if (!campaigns) return null;
          return prisma.campaign.findUnique({
            where: { slug: campaigns.slug },
            include: {
              company: { select: { id: true, name: true, slug: true } },
              _count: { select: { employees: true, gifts: true } },
            },
          });
        },
        prisma,
        ITERATIONS,
      ),
    );

    // 13. Gifts findMany (like admin.gifts.list)
    results.push(
      await measure(
        'db.findMany.gifts-all',
        'gift.findMany(include campaign, images) — ~admin.gifts.list',
        () =>
          prisma.gift.findMany({
            where: { deletedAt: null, campaign: { deletedAt: null } },
            include: {
              campaign: { select: { id: true, name: true, slug: true } },
              images: { select: { id: true, imageUrl: true, isPrimary: true } },
            },
          }),
        prisma,
        ITERATIONS,
      ),
    );

    // 14. Dashboard simulation: 21 parallel counts
    results.push(
      await measure(
        'db.parallel.21-counts',
        '21 x count() queries in Promise.all — simulating dashboard cache-miss',
        async () => {
          const cf: any = { deletedAt: null };
          const ef: any = { deletedAt: null, campaign: { deletedAt: null } };
          const bf: any = { deletedAt: null, employee: { deletedAt: null, campaign: { deletedAt: null } } };
          const gf: any = { deletedAt: null, campaign: { deletedAt: null } };
          const sf: any = { campaign: { deletedAt: null } };
          const supf: any = { campaignId: { not: null }, campaign: { deletedAt: null } };

          await Promise.all([
            prisma.campaign.count({ where: cf }),
            prisma.campaign.count({ where: { ...cf, status: 'ACTIVE' } }),
            prisma.campaign.count({ where: { ...cf, status: { in: ['CLOSED', 'ARCHIVED', 'PAUSED'] } } }),
            prisma.campaign.count({ where: { ...cf, status: 'DRAFT' } }),
            prisma.employee.count({ where: ef }),
            prisma.employee.count({ where: { ...ef, status: 'PENDING' } }),
            prisma.employee.count({ where: { ...ef, status: 'IN_PROGRESS' } }),
            prisma.employee.count({ where: { ...ef, status: 'CONFIRMED' } }),
            prisma.employee.count({ where: { ...ef, status: 'BLOCKED' } }),
            prisma.beneficiary.count({ where: bf }),
            prisma.gift.count({ where: gf }),
            prisma.gift.count({ where: { ...gf, status: 'ACTIVE' } }),
            prisma.gift.count({ where: { ...gf, status: 'INACTIVE' } }),
            prisma.gift.aggregate({ where: gf, _sum: { stock: true } }),
            prisma.supportRequest.count({ where: supf }),
            prisma.supportRequest.count({ where: { ...supf, status: 'OPEN' } }),
            prisma.supportRequest.count({ where: { ...supf, status: 'IN_REVIEW' } }),
            prisma.supportRequest.count({ where: { ...supf, status: 'RESOLVED' } }),
            prisma.selectionItem.count({ where: { selection: { ...sf, status: 'CONFIRMED' } } }),
            prisma.selection.count({ where: { ...sf, status: 'CANCELLED' } }),
            prisma.company.count({ where: { deletedAt: null, isActive: true } }),
          ]);
        },
        prisma,
        ITERATIONS,
      ),
    );

    // Print results
    console.log('\n=== RAW DB QUERY TIMINGS ===\n');
    console.log(
      'Query'.padEnd(42) +
        'p50(ms)'.padStart(10) +
        'p95(ms)'.padStart(10) +
        'mean(ms)'.padStart(10),
    );
    console.log('-'.repeat(72));

    for (const r of results) {
      console.log(
        r.name.padEnd(42) +
          String(r.p50).padStart(10) +
          String(r.p95).padStart(10) +
          String(r.mean).padStart(10),
      );
    }

    console.log('\n=== DETAILS ===\n');
    for (const r of results) {
      console.log(`${r.name}: ${r.description}`);
      console.log(`  p50=${r.p50}ms  p95=${r.p95}ms  p99=${r.p99}ms  mean=${r.mean}ms  min=${r.min}ms  max=${r.max}ms`);
      console.log(`  samples: [${r.samples.join(', ')}]\n`);
    }

    console.log('✓ DB diagnostic complete.\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`\n✗ DB diagnostic failed: ${err.message}`);
  process.exit(1);
});

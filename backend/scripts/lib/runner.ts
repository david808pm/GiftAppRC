import { StatsResult, stats } from './stats';
import { classifyEndpoint } from './safety';

export interface EndpointDefinition {
  name: string;
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface BenchmarkEndpointResult {
  name: string;
  method: string;
  path: string;
  classification: string;
  warm: StatsResult;
  cold: StatsResult | null;
}

export interface BenchmarkReport {
  benchmarkVersion: string;
  timestamp: string;
  target: string;
  iterations: number;
  warmupIterations: number;
  nodeVersion: string;
  endpoints: BenchmarkEndpointResult[];
}

const BENCHMARK_VERSION = '1.0.0';

async function timedFetch(
  url: string,
  options: RequestInit,
): Promise<{ durationMs: number; status: number }> {
  const start = performance.now();
  const res = await fetch(url, options);
  const durationMs = performance.now() - start;

  await res.text();

  return { durationMs, status: res.status };
}

export async function measureEndpoint(
  def: EndpointDefinition,
  baseUrl: string,
  iterations: number,
): Promise<StatsResult> {
  const url = `${baseUrl}${def.path}`;
  const durations: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const { durationMs, status } = await timedFetch(url, {
      method: def.method,
      headers: {
        'Content-Type': 'application/json',
        ...(def.headers || {}),
      },
      ...(def.body ? { body: JSON.stringify(def.body) } : {}),
    });

    if (status >= 500) {
      console.warn(`  ⚠ ${def.name}: HTTP ${status} on iteration ${i + 1}`);
    }

    durations.push(durationMs);
  }

  return stats(durations);
}

export async function measureColdStart(
  def: EndpointDefinition,
  baseUrl: string,
): Promise<StatsResult> {
  return measureEndpoint(def, baseUrl, 1);
}

export async function warmupEndpoint(
  def: EndpointDefinition,
  baseUrl: string,
  count: number,
): Promise<void> {
  const url = `${baseUrl}${def.path}`;
  for (let i = 0; i < count; i++) {
    try {
      await timedFetch(url, {
        method: def.method,
        headers: {
          'Content-Type': 'application/json',
          ...(def.headers || {}),
        },
        ...(def.body ? { body: JSON.stringify(def.body) } : {}),
      });
    } catch {
      // warmup failures are noisy but non-fatal
    }
  }
}

export async function benchmarkSuite(params: {
  endpoints: EndpointDefinition[];
  baseUrl: string;
  iterations: number;
  warmupIterations: number;
}): Promise<BenchmarkReport> {
  const { endpoints, baseUrl, iterations, warmupIterations } = params;

  console.log(`\n=== Warmup phase: ${warmupIterations} iterations each ===\n`);

  for (const def of endpoints) {
    process.stdout.write(`  Warming ${def.name}... `);
    await warmupEndpoint(def, baseUrl, warmupIterations);
    console.log('done');
  }

  console.log(`\n=== Cold-start phase: 1 call each (server cold) ===\n`);

  const coldResults: Map<string, StatsResult> = new Map();

  for (const def of endpoints) {
    process.stdout.write(`  Cold ${def.name}... `);
    const result = await measureColdStart(def, baseUrl);
    coldResults.set(def.name, result);
    console.log(`${result.mean}ms`);
  }

  console.log(`\n=== Measurement phase: ${iterations} iterations each (isolated) ===\n`);

  const warmResults: Map<string, StatsResult> = new Map();

  for (const def of endpoints) {
    process.stdout.write(`  ${def.name}... `);
    const result = await measureEndpoint(def, baseUrl, iterations);
    warmResults.set(def.name, result);
    console.log(`p50=${result.p50}ms p95=${result.p95}ms mean=${result.mean}ms`);
  }

  const reportEndpoints: BenchmarkEndpointResult[] = endpoints.map((def) => {
    const classification = classifyEndpoint(def.method, def.path);
    const cold = coldResults.get(def.name) || null;

    return {
      name: def.name,
      method: def.method,
      path: def.path,
      classification,
      warm: warmResults.get(def.name)!,
      cold,
    };
  });

  return {
    benchmarkVersion: BENCHMARK_VERSION,
    timestamp: new Date().toISOString(),
    target: baseUrl,
    iterations,
    warmupIterations,
    nodeVersion: process.version,
    endpoints: reportEndpoints,
  };
}

export interface StatsResult {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  min: number;
  max: number;
  stddev: number;
  count: number;
  samples: number[];
}

export function percentile(values: number[], pct: number): number {
  if (values.length === 0) return Number.NaN;
  if (values.length === 1) return values[0];

  const sorted = values.length > 1 ? [...values].sort((a, b) => a - b) : values;
  const index = (pct / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];

  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function mean(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

export function stddev(values: number[], avg?: number): number {
  if (values.length < 2) return 0;
  const m = avg ?? mean(values);
  const squaredDiffs = values.map((v) => (v - m) ** 2);
  return Math.sqrt(mean(squaredDiffs));
}

export function stats(values: number[]): StatsResult {
  if (values.length === 0) {
    return {
      p50: Number.NaN,
      p95: Number.NaN,
      p99: Number.NaN,
      mean: Number.NaN,
      min: Number.NaN,
      max: Number.NaN,
      stddev: 0,
      count: 0,
      samples: [],
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const avg = mean(values);

  return {
    p50: round2(percentile(sorted, 50)),
    p95: round2(percentile(sorted, 95)),
    p99: round2(percentile(sorted, 99)),
    mean: round2(avg),
    min: round2(sorted[0]),
    max: round2(sorted[sorted.length - 1]),
    stddev: round2(stddev(values, avg)),
    count: values.length,
    samples: values.map(round2),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

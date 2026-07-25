import { percentile, mean, stddev, stats } from '../lib/stats';

describe('percentile', () => {
  it('returns NaN for empty array', () => {
    expect(percentile([], 50)).toBeNaN();
  });

  it('returns single element for length=1', () => {
    expect(percentile([5], 50)).toBe(5);
    expect(percentile([5], 95)).toBe(5);
  });

  it('p50 of [1,2,3,4,5] is 3', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBeCloseTo(3, 2);
  });

  it('p50 of [1,2,3,4] is 2.5 (linear interpolation)', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBeCloseTo(2.5, 2);
  });

  it('p95 of [1..100] is 95.05', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(arr, 95)).toBeCloseTo(95.05, 2);
  });

  it('p99 of [1..100] is 99.01', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(arr, 99)).toBeCloseTo(99.01, 2);
  });

  it('handles unsorted input', () => {
    expect(percentile([5, 1, 4, 2, 3], 50)).toBeCloseTo(3, 2);
  });

  it('p0 returns min element', () => {
    expect(percentile([5, 1, 4, 2, 3], 0)).toBe(1);
  });

  it('p100 returns max element', () => {
    expect(percentile([5, 1, 4, 2, 3], 100)).toBe(5);
  });

  it('all elements equal returns that value', () => {
    expect(percentile([7, 7, 7, 7], 50)).toBe(7);
  });
});

describe('mean', () => {
  it('returns NaN for empty', () => {
    expect(mean([])).toBeNaN();
  });

  it('mean of [1,2,3] is 2', () => {
    expect(mean([1, 2, 3])).toBeCloseTo(2, 5);
  });

  it('mean of [2] is 2', () => {
    expect(mean([2])).toBeCloseTo(2, 5);
  });

  it('mean of [0,100] is 50', () => {
    expect(mean([0, 100])).toBeCloseTo(50, 5);
  });

  it('handles negative values', () => {
    expect(mean([-5, 5])).toBeCloseTo(0, 5);
  });
});

describe('stddev', () => {
  it('returns 0 for empty array', () => {
    expect(stddev([])).toBe(0);
  });

  it('returns 0 for single element', () => {
    expect(stddev([5])).toBe(0);
  });

  it('stddev of [2,4,4,4,5,5,7,9]', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(stddev(values)).toBeCloseTo(2, 1);
  });

  it('stddev of uniform values is 0', () => {
    expect(stddev([10, 10, 10])).toBe(0);
  });
});

describe('stats', () => {
  it('returns NaN-filled result for empty', () => {
    const result = stats([]);
    expect(result.count).toBe(0);
    expect(result.p50).toBeNaN();
    expect(result.mean).toBeNaN();
    expect(result.stddev).toBe(0);
    expect(result.samples).toEqual([]);
  });

  it('computes full stats for [1,2,3,4,5]', () => {
    const result = stats([1, 2, 3, 4, 5]);
    expect(result.p50).toBeCloseTo(3, 2);
    expect(result.mean).toBeCloseTo(3, 2);
    expect(result.min).toBe(1);
    expect(result.max).toBe(5);
    expect(result.count).toBe(5);
    expect(result.samples).toHaveLength(5);
  });

  it('count matches input length', () => {
    const result = stats([10, 20, 30]);
    expect(result.count).toBe(3);
  });

  it('samples are rounded to 2 decimals', () => {
    const result = stats([1.234, 2.345, 3.456]);
    expect(result.samples).toEqual([1.23, 2.35, 3.46]);
  });
});

import { describe, expect, it } from 'vitest';
import { detectHeatwaves, detectColdWaves, TH } from './extremes';
import type { YearlyData } from '../types';

function makeYear(year: number, maxTemps: (number | null)[], minTemps: (number | null)[], labels: string[]): YearlyData {
  return {
    year,
    dates: labels.map((md) => `${year}-${md}`),
    maxTemps,
    minTemps,
    forecastFlags: labels.map(() => false),
  };
}

describe('detectHeatwaves', () => {
  it('detects a run of exactly 3 days at threshold (35°C)', () => {
    const labels = ['06-01', '06-02', '06-03', '06-04'];
    const data = makeYear(2024, [35, 35, 35, 34], [20, 20, 20, 20], labels);
    const waves = detectHeatwaves([data], labels);
    expect(waves).toHaveLength(1);
    expect(waves[0].duration).toBe(3);
    expect(waves[0].startMd).toBe('06-01');
    expect(waves[0].endMd).toBe('06-03');
    expect(waves[0].avgMax).toBeCloseTo(35);
  });

  it('does not count a run of 2 days (below min 3)', () => {
    const labels = ['06-01', '06-02', '06-03'];
    const data = makeYear(2024, [36, 36, 30], [20, 20, 20], labels);
    const waves = detectHeatwaves([data], labels);
    expect(waves).toHaveLength(0);
  });

  it('threshold 35 is inclusive (>=)', () => {
    const labels = ['06-01', '06-02', '06-03'];
    const data = makeYear(2024, [35, 35, 35], [20, 20, 20], labels);
    expect(detectHeatwaves([data], labels)).toHaveLength(1);
  });

  it('34.9 is not a heat day', () => {
    const labels = ['06-01', '06-02', '06-03'];
    const data = makeYear(2024, [34.9, 34.9, 34.9], [20, 20, 20], labels);
    expect(detectHeatwaves([data], labels)).toHaveLength(0);
  });

  it('null temperature breaks the run', () => {
    const labels = ['06-01', '06-02', '06-03', '06-04', '06-05'];
    const data = makeYear(2024, [36, null, 36, 36, 36], [20, 20, 20, 20, 20], labels);
    const waves = detectHeatwaves([data], labels);
    expect(waves).toHaveLength(1);
    expect(waves[0].startMd).toBe('06-03');
  });

  it('handles leap day 02-29 in labels', () => {
    const labels = ['02-28', '02-29', '03-01', '03-02', '03-03'];
    const data = makeYear(2024, [36, 36, 36, 36, 30], [20, 20, 20, 20, 20], labels);
    const waves = detectHeatwaves([data], labels);
    expect(waves).toHaveLength(1);
    expect(waves[0].duration).toBe(4);
    expect(waves[0].endMd).toBe('03-02');
  });
});

describe('detectColdWaves', () => {
  it('detects coldwave: tmin<=-5 and tmax<=0 for >=3 days', () => {
    const labels = ['01-01', '01-02', '01-03', '01-04'];
    const data = makeYear(2024, [-2, -2, -2, 5], [-8, -8, -8, 2], labels);
    const waves = detectColdWaves([data], labels);
    expect(waves).toHaveLength(1);
    expect(waves[0].duration).toBe(3);
    expect(waves[0].kind).toBe('coldwave');
  });

  it('marks severe_cold when any day tmin<=-10', () => {
    const labels = ['01-01', '01-02', '01-03'];
    const data = makeYear(2024, [-3, -3, -3], [-8, -12, -8], labels);
    const waves = detectColdWaves([data], labels);
    expect(waves).toHaveLength(1);
    expect(waves[0].kind).toBe('severe_cold');
  });

  it('tmin=-4 does not qualify (must be <=-5)', () => {
    const labels = ['01-01', '01-02', '01-03'];
    const data = makeYear(2024, [-1, -1, -1], [-4, -4, -4], labels);
    expect(detectColdWaves([data], labels)).toHaveLength(0);
  });

  it('tmax=1 disqualifies even if tmin is low', () => {
    const labels = ['01-01', '01-02', '01-03'];
    const data = makeYear(2024, [1, 1, 1], [-8, -8, -8], labels);
    expect(detectColdWaves([data], labels)).toHaveLength(0);
  });

  it('handles wrapping range crossing year boundary', () => {
    // 跨年区间 12-31 → 01-03，分界点在 01-01
    const labels = ['12-31', '01-01', '01-02', '01-03'];
    const data = makeYear(2024, [-2, -2, -2, -2], [-8, -8, -8, -8], labels);
    const waves = detectColdWaves([data], labels);
    expect(waves).toHaveLength(1);
    // 起始日 12-31 属 year(2024)，结束日 01-03 属 year+1(2025)
    expect(waves[0].startDate).toBe('2024-12-31');
    expect(waves[0].endDate).toBe('2025-01-03');
  });
});

describe('thresholds sanity', () => {
  it('TH constants are as expected', () => {
    expect(TH.HEATWAVE_TMAX).toBe(35);
    expect(TH.COLDWAVE_TMIN).toBe(-5);
    expect(TH.COLDWAVE_TMAX).toBe(0);
    expect(TH.HEATWAVE_MIN_DAYS).toBe(3);
    expect(TH.COLDWAVE_MIN_DAYS).toBe(3);
    expect(TH.SEVERE_COLD_TMIN).toBe(-10);
  });
});

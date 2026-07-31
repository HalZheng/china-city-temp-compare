import { describe, expect, it } from 'vitest';
import type { YearlyData } from '../types';
import { detectColdWaves, detectHeatwaves } from './extremes';
import { buildYearSummaryStats } from './stats';

const labels = ['07-01', '07-02', '07-03'];
const yearlyData: YearlyData[] = [
  {
    year: 2024,
    dates: labels,
    maxTemps: [36, 37, 38],
    minTemps: [26, 27, 28],
    forecastFlags: [false, false, false],
  },
  {
    year: 2025,
    dates: labels,
    maxTemps: [-1, -2, -3],
    minTemps: [-6, -7, -8],
    forecastFlags: [false, false, true],
  },
];

describe('buildYearSummaryStats', () => {
  it('keeps event and day counts separate for each year', () => {
    const heatwaves = detectHeatwaves(yearlyData, labels);
    const coldWaves = detectColdWaves(yearlyData, labels);
    const summaries = buildYearSummaryStats(yearlyData, 'max', heatwaves, coldWaves);

    expect(summaries[0]).toMatchObject({
      year: 2024,
      hotDays: 3,
      tropicalNights: 3,
      heatwaveCount: 1,
      coldWaveCount: 0,
      includesForecast: false,
    });
    expect(summaries[1]).toMatchObject({
      year: 2025,
      hotDays: 0,
      freezingDays: 3,
      coldWaveCount: 1,
      includesForecast: true,
    });
  });
});

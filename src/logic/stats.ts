import type { ColdWavePeriod, HeatwavePeriod, SummaryStats, TempType, YearAverage, YearlyData, YearSummaryStats } from '../types';
import { buildColdWaveStats, buildHeatwaveStats } from './extremes';

/** 单年区间平均气温（仅用有效值） */
export function averageOfYear(y: YearlyData, tempType: TempType): number | null {
  const arr = tempType === 'max' ? y.maxTemps : y.minTemps;
  const vals = arr.filter((t): t is number => t !== null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * 逐日多年平均（图表虚线数据源）。
 * 对每个 MM-DD 槽位，跨所有年份对该 tempType 求有效值均值。
 * 02-29 仅闰年有值，平年为 null → 自然不参与该日均值（不抹平、不丢年）。
 */
export function multiYearDailyAverage(
  yearlyData: YearlyData[],
  labels: string[],
  tempType: TempType,
): (number | null)[] {
  if (yearlyData.length === 0) return [];
  return labels.map((_, i) => {
    const vals = yearlyData
      .map((y) => (tempType === 'max' ? y.maxTemps[i] : y.minTemps[i]))
      .filter((t): t is number => t !== null);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
}

export function buildSummaryStats(
  yearlyData: YearlyData[],
  tempType: TempType,
  heatwaves: HeatwavePeriod[],
  coldWaves: ColdWavePeriod[],
): SummaryStats {
  const allVals: number[] = [];
  for (const y of yearlyData) {
    const arr = tempType === 'max' ? y.maxTemps : y.minTemps;
    for (const t of arr) if (t !== null) allVals.push(t);
  }
  const periodAvg = allVals.length ? allVals.reduce((a, b) => a + b, 0) / allVals.length : null;
  const h = buildHeatwaveStats(heatwaves, yearlyData);
  const c = buildColdWaveStats(coldWaves, yearlyData);
  return {
    periodAvg,
    hotDays: h.hotDays,
    tropicalNights: h.tropicalNights,
    heatwaveCount: h.heatwaveCount,
    freezingDays: c.freezingDays,
    extremeColdNights: c.extremeColdNights,
    coldWaveCount: c.coldWaveCount,
    severeColdCount: c.severeColdCount,
  };
}

export function buildYearAverages(yearlyData: YearlyData[], tempType: TempType): YearAverage[] {
  return yearlyData.map((y) => ({ year: y.year, average: averageOfYear(y, tempType) }));
}

export function buildYearSummaryStats(
  yearlyData: YearlyData[],
  tempType: TempType,
  heatwaves: HeatwavePeriod[],
  coldWaves: ColdWavePeriod[],
): YearSummaryStats[] {
  return yearlyData.map((yearData) => ({
    year: yearData.year,
    includesForecast: yearData.forecastFlags.some(Boolean),
    ...buildSummaryStats(
      [yearData],
      tempType,
      heatwaves.filter((period) => period.year === yearData.year),
      coldWaves.filter((period) => period.year === yearData.year),
    ),
  }));
}

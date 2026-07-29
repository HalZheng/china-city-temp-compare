import type { ColdWavePeriod, HeatwavePeriod, YearlyData } from '../types';

/**
 * 中国国标量级阈值（常量集中，便于以后微调）。
 * - 高温日/高温热浪：日最高气温 ≥ 35℃，连续 ≥3 天为一次热浪；
 * - 热夜：日最低气温 ≥ 25℃；
 * - 寒潮：日最低气温 ≤ -5℃ 且 日最高气温 ≤ 0℃，连续 ≥3 天；其中日最低 ≤ -10℃ 标记为严寒；
 * - 冰冻日：日最低 ≤ 0℃；极端寒夜：日最低 ≤ -5℃。
 * 注：采用"绝对低温简化"判定（你已确认），不采用 GB/T 27957 的降温幅度法。
 */
export const TH = {
  HEAT_DAY_TMAX: 35,
  HEATWAVE_TMAX: 35,
  HEATWAVE_MIN_DAYS: 3,
  TROPICAL_NIGHT_TMIN: 25,
  COLDWAVE_TMIN: -5,
  COLDWAVE_TMAX: 0,
  COLDWAVE_MIN_DAYS: 3,
  SEVERE_COLD_TMIN: -10,
  FREEZING_TMIN: 0,
  EXTREME_COLD_TMIN: -5,
} as const;

interface DayInput {
  md: string;
  date: string;
  tmax: number | null;
  tmin: number | null;
  isForecast: boolean;
}

/** 跨年分界：标签由 12-xx 过渡到 01-xx 的位置（与 DataTable 同口径） */
function findSplitIndex(labels: string[]): number {
  return labels.findIndex((md, i) => i > 0 && labels[i - 1].startsWith('12-') && md.startsWith('01-'));
}

/**
 * 把某年数据展开为逐日输入，并还原真实日历日期。
 * 跨年区间中，分界点之后的日期属于 year+1（用于极端事件按真实年分组）。
 * 闰年 02-29 在平年中为 null（沿用项目 MM-DD 对齐，不抹平、不丢弃）。
 */
function buildDayInputs(y: YearlyData, labels: string[]): DayInput[] {
  const split = findSplitIndex(labels);
  return labels.map((md, i) => {
    const calYear = split >= 0 && i >= split ? y.year + 1 : y.year;
    return {
      md,
      date: `${calYear}-${md}`,
      tmax: y.maxTemps[i],
      tmin: y.minTemps[i],
      isForecast: y.forecastFlags[i] ?? false,
    };
  });
}

function findRuns(days: DayInput[], pred: (d: DayInput) => boolean, minDays: number): [number, number][] {
  const runs: [number, number][] = [];
  let i = 0;
  while (i < days.length) {
    if (!pred(days[i])) {
      i++;
      continue;
    }
    const start = i;
    while (i < days.length && pred(days[i])) i++;
    const end = i - 1;
    if (end - start + 1 >= minDays) runs.push([start, end]);
  }
  return runs;
}

export function detectHeatwaves(yearlyData: YearlyData[], labels: string[]): HeatwavePeriod[] {
  const out: HeatwavePeriod[] = [];
  for (const y of yearlyData) {
    const days = buildDayInputs(y, labels);
    const runs = findRuns(days, (d) => d.tmax !== null && d.tmax >= TH.HEATWAVE_TMAX, TH.HEATWAVE_MIN_DAYS);
    for (const [s, e] of runs) {
      const seg = days.slice(s, e + 1);
      const vals = seg.map((d) => d.tmax as number);
      out.push({
        year: y.year,
        startMd: days[s].md,
        endMd: days[e].md,
        startDate: days[s].date,
        endDate: days[e].date,
        startDay: s,
        endDay: e,
        duration: e - s + 1,
        avgMax: vals.reduce((a, b) => a + b, 0) / vals.length,
        includesForecast: seg.some((d) => d.isForecast),
      });
    }
  }
  return out;
}

export function detectColdWaves(yearlyData: YearlyData[], labels: string[]): ColdWavePeriod[] {
  const out: ColdWavePeriod[] = [];
  for (const y of yearlyData) {
    const days = buildDayInputs(y, labels);
    const runs = findRuns(
      days,
      (d) => d.tmin !== null && d.tmax !== null && d.tmin <= TH.COLDWAVE_TMIN && d.tmax <= TH.COLDWAVE_TMAX,
      TH.COLDWAVE_MIN_DAYS,
    );
    for (const [s, e] of runs) {
      const seg = days.slice(s, e + 1);
      const vals = seg.map((d) => d.tmin as number);
      const severe = seg.some((d) => (d.tmin as number) <= TH.SEVERE_COLD_TMIN);
      out.push({
        year: y.year,
        kind: severe ? 'severe_cold' : 'coldwave',
        startMd: days[s].md,
        endMd: days[e].md,
        startDate: days[s].date,
        endDate: days[e].date,
        startDay: s,
        endDay: e,
        duration: e - s + 1,
        avgMin: vals.reduce((a, b) => a + b, 0) / vals.length,
        includesForecast: seg.some((d) => d.isForecast),
      });
    }
  }
  return out;
}

export function buildHeatwaveStats(heatwaves: HeatwavePeriod[], yearlyData: YearlyData[]): {
  hotDays: number;
  tropicalNights: number;
  heatwaveCount: number;
} {
  let hotDays = 0;
  let tropicalNights = 0;
  for (const y of yearlyData) {
    hotDays += y.maxTemps.filter((t) => t !== null && t >= TH.HEAT_DAY_TMAX).length;
    tropicalNights += y.minTemps.filter((t) => t !== null && t >= TH.TROPICAL_NIGHT_TMIN).length;
  }
  return { hotDays, tropicalNights, heatwaveCount: heatwaves.length };
}

export function buildColdWaveStats(
  coldWaves: ColdWavePeriod[],
  yearlyData: YearlyData[],
): { freezingDays: number; extremeColdNights: number; coldWaveCount: number; severeColdCount: number } {
  let freezingDays = 0;
  let extremeColdNights = 0;
  for (const y of yearlyData) {
    freezingDays += y.minTemps.filter((t) => t !== null && t <= TH.FREEZING_TMIN).length;
    extremeColdNights += y.minTemps.filter((t) => t !== null && t <= TH.EXTREME_COLD_TMIN).length;
  }
  const severeColdCount = coldWaves.filter((c) => c.kind === 'severe_cold').length;
  const coldWaveCount = coldWaves.filter((c) => c.kind === 'coldwave').length;
  return { freezingDays, extremeColdNights, coldWaveCount, severeColdCount };
}

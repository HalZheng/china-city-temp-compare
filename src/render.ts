import type { AppState, ColdWavePeriod, HeatwavePeriod, TempType, YearAverage, YearlyData, YearSummaryStats } from './types';
import { buildYearAverages, buildYearSummaryStats, multiYearDailyAverage } from './logic/stats';

/**
 * 统一渲染入口：解决旧实现中 handleQuery 和 setTempType 各自手动调用 4 个组件 update 的易遗漏问题。
 * - renderAll(): 全量渲染（chart/stats/extreme/table），用于查询成功后
 * - renderAll({ skipTable: true }): 跳过表格，用于 setTempType（表格同时显示 max/min，切 tempType 无需重渲染）
 *
 * runtime 由调用方维护（currentLabels/currentCityName/currentYearColors/cachedHeatwaves/cachedColdWaves），
 * query.ts 在数据变化后更新 runtime 再调 renderAll。
 */

export interface RenderRuntime {
  currentLabels: string[];
  currentCityName: string;
  currentYearColors: Record<number, string>;
  cachedHeatwaves: HeatwavePeriod[];
  cachedColdWaves: ColdWavePeriod[];
}

export interface RenderComponents {
  chart: {
    update: (
      data: YearlyData[],
      tempType: TempType,
      colors: Record<number, string>,
      cityName: string,
      labels: string[],
      averageLine?: (number | null)[],
      yearAverages?: YearAverage[],
    ) => void;
  };
  dataTable: { update: (data: YearlyData[], labels: string[]) => void };
  statsCards: { update: (summaries: YearSummaryStats[], tempType: TempType, colors: Record<number, string>) => void };
  extremeCards: { update: (heatwaves: HeatwavePeriod[], coldWaves: ColdWavePeriod[], colors: Record<number, string>) => void };
}

export interface RenderDeps {
  state: AppState;
  components: RenderComponents;
  runtime: RenderRuntime;
}

export function createRenderAll(deps: RenderDeps): (opts?: { skipTable?: boolean }) => void {
  const { state, components, runtime } = deps;
  return function renderAll(opts: { skipTable?: boolean } = {}): void {
    if (state.yearlyData.length === 0) return;
    const avgLine = multiYearDailyAverage(state.yearlyData, runtime.currentLabels, state.tempType);
    const summaries = buildYearSummaryStats(state.yearlyData, state.tempType, runtime.cachedHeatwaves, runtime.cachedColdWaves);
    const yearAverages = buildYearAverages(state.yearlyData, state.tempType);
    components.chart.update(
      state.yearlyData,
      state.tempType,
      runtime.currentYearColors,
      runtime.currentCityName,
      runtime.currentLabels,
      avgLine,
      yearAverages,
    );
    components.statsCards.update(summaries, state.tempType, runtime.currentYearColors);
    components.extremeCards.update(runtime.cachedHeatwaves, runtime.cachedColdWaves, runtime.currentYearColors);
    if (!opts.skipTable) {
      components.dataTable.update(state.yearlyData, runtime.currentLabels);
    }
  };
}

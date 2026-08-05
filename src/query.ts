import type { AppState, City, YearlyData } from './types';
import { fetchHistoricalWeather, fetchForecastWeather } from './api/open-meteo';
import { assignColorsByAverageTemp, buildMonthDayLabels, formatDate, isWrappingRange } from './utils/helpers';
import { pLimit } from './utils/pLimit';
import { detectColdWaves, detectHeatwaves } from './logic/extremes';
import type { RenderRuntime } from './render';
import type { SkeletonInstance } from './skeleton';
import type { MessageBannerInstance } from './message';
import { updateUrlFromState } from './router';

/**
 * 查询编排模块。
 * - fetchYearData: 单年数据获取（archive/forecast 分流 + horizon 截断），独立导出便于测试
 * - createQueryHandler: 返回 { handleQuery, retryFailed }
 * - handleQuery: 全量查询（abort 上一次 + 并发 3 + 缓存极端事件 + 渲染 + URL 持久化）
 * - retryFailed: 仅重发失败年份（任务 6），复用 LRUCache 命中已成功部分
 */

const mdOf = (dateStr: string) => dateStr.substring(5);

/**
 * 获取某一年的气温数据并标准化为"月日对齐"的结构。
 * - 跨年区间拆为"起始年段"与"次年段"分别取数；
 * - 当年区间按"今天"拆分为历史段(archive)与未来段(forecast)，避免整段走 forecast 导致历史数据丢失；
 * - 最终按统一的月日标签对齐，闰年差异自然表现为 null。
 */
export async function fetchYearData(
  city: City,
  year: number,
  startMonthDay: string,
  endMonthDay: string,
  todayStr: string,
  signal: AbortSignal,
): Promise<YearlyData> {
  const wrap = isWrappingRange(startMonthDay, endMonthDay);
  const segments: [string, string][] = [];
  if (!wrap) {
    segments.push([`${year}-${startMonthDay}`, `${year}-${endMonthDay}`]);
  } else {
    segments.push([`${year}-${startMonthDay}`, `${year}-12-31`]);
    segments.push([`${year + 1}-01-01`, `${year + 1}-${endMonthDay}`]);
  }

  const byMD = new Map<string, { max: number | null; min: number | null }>();
  const forecastMD = new Set<string>();
  // 预报接口仅覆盖约未来 15 天（实测 ≥16 天返回 HTTP 400），超出部分无数据
  const HORIZON_DAYS = 15;
  const tomorrow = new Date(`${todayStr}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatDate(tomorrow);
  const horizon = new Date(`${todayStr}T00:00:00`);
  horizon.setDate(horizon.getDate() + HORIZON_DAYS);
  const horizonStr = formatDate(horizon);

  let truncated = false;
  let forecastError = false;

  for (const [segStart, segEnd] of segments) {
    // 历史段：<= 今天，使用 archive 接口（含完整历史）
    const pastEnd = segEnd < todayStr ? segEnd : todayStr;
    if (segStart <= pastEnd) {
      const resp = await fetchHistoricalWeather(city, segStart, pastEnd, signal);
      resp.daily.time.forEach((t, i) => {
        byMD.set(mdOf(t), {
          max: resp.daily.temperature_2m_max[i],
          min: resp.daily.temperature_2m_min[i],
        });
      });
    }
    // 未来段：> 今天，使用 forecast 接口。
    // 将请求结束日收敛到 horizon 内（必成功），超出 horizon 的日期无数据(null)；
    // 即便接口仍报错（限流等），也只跳过未来段、保留已取到的历史段，避免整年数据丢失。
    const futStart = segStart > tomorrowStr ? segStart : tomorrowStr;
    const futEnd = segEnd < horizonStr ? segEnd : horizonStr;
    if (futStart <= futEnd) {
      try {
        const resp = await fetchForecastWeather(city, futStart, futEnd, signal);
        resp.daily.time.forEach((t, i) => {
          byMD.set(mdOf(t), {
            max: resp.daily.temperature_2m_max[i],
            min: resp.daily.temperature_2m_min[i],
          });
          forecastMD.add(mdOf(t));
        });
      } catch (error) {
        if (signal.aborted) throw error;
        forecastError = true;
      }
    }
    if (segEnd > horizonStr) truncated = true;
  }

  const labels = buildMonthDayLabels(startMonthDay, endMonthDay);
  const maxTemps = labels.map((md) => (byMD.has(md) ? byMD.get(md)!.max : null));
  const minTemps = labels.map((md) => (byMD.has(md) ? byMD.get(md)!.min : null));
  const forecastFlags = labels.map((md) => forecastMD.has(md));

  return { year, dates: labels, maxTemps, minTemps, forecastFlags, truncated, forecastError };
}

export interface QueryDeps {
  state: AppState;
  skeleton: SkeletonInstance;
  message: MessageBannerInstance;
  renderAll: (opts?: { skipTable?: boolean }) => void;
  runtime: RenderRuntime;
  defaults: {
    startMonthDay: string;
    endMonthDay: string;
    years: number[];
    fallbackCity: City;
  };
  queryBtn: HTMLButtonElement;
  /** 导出 CSV 按钮：查询成功后启用，失败/加载中禁用 */
  exportCsvBtn: HTMLButtonElement;
  /** 各 section 元素，查询无数据时隐藏 */
  sections: {
    chart: HTMLElement;
    stats: HTMLElement;
    extreme: HTMLElement;
    table: HTMLElement;
  };
}

export interface QueryHandlerInstance {
  handleQuery: () => Promise<void>;
  retryFailed: () => Promise<void>;
  /** 当前是否有失败年份（供 UI 判断） */
  hasFailedYears: () => boolean;
}

export function createQueryHandler(deps: QueryDeps): QueryHandlerInstance {
  const { state, skeleton, message, renderAll, runtime, defaults, queryBtn, exportCsvBtn, sections } = deps;

  // 失败年份缓存：handleQuery 写入，retryFailed 读取
  let failedYears: { year: number; error: string }[] = [];
  let activeQueryController: AbortController | null = null;
  let querySequence = 0;
  // 最近一次成功查询的快照（city/startMonthDay/endMonthDay/selectedYears），retryFailed 复用
  let lastQuery: { city: City; startMonthDay: string; endMonthDay: string; selectedYears: number[] } | null = null;

  function hasFailedYears(): boolean {
    return failedYears.length > 0;
  }

  async function fetchYears(years: number[], city: City, startMonthDay: string, endMonthDay: string, todayStr: string, signal: AbortSignal): Promise<YearlyData[]> {
    const limiter = pLimit(3);
    const promises = years.map((year) =>
      limiter(async () => {
        try {
          return await fetchYearData(city, year, startMonthDay, endMonthDay, todayStr, signal);
        } catch (error) {
          if (signal.aborted) throw error;
          return {
            year,
            dates: [],
            maxTemps: [],
            minTemps: [],
            forecastFlags: [],
            error: error instanceof Error ? error.message : '请求失败',
          } as YearlyData;
        }
      }),
    );
    return Promise.all(promises);
  }

  /**
   * 重算 runtime（labels/颜色/极端事件）并触发渲染。
   * handleQuery 和 retryFailed 共用，避免两处重复逻辑导致签名漂移。
   */
  function updateRuntime(data: YearlyData[], query: { city: City; startMonthDay: string; endMonthDay: string }): void {
    runtime.currentLabels = buildMonthDayLabels(query.startMonthDay, query.endMonthDay);
    runtime.currentCityName = query.city.name;
    // 按区间均值分配颜色（最热红 → 最冷紫）
    const yearAvgTemps = data.map((r) => {
      const validMax = r.maxTemps.filter((t): t is number => t !== null);
      const avgMax = validMax.length > 0 ? validMax.reduce((a, b) => a + b, 0) / validMax.length : 0;
      return { year: r.year, avgTemp: avgMax };
    });
    runtime.currentYearColors = assignColorsByAverageTemp(yearAvgTemps);
    // 检测极端事件并缓存（与 tempType 无关，切 tab 时复用）
    runtime.cachedHeatwaves = detectHeatwaves(data, runtime.currentLabels);
    runtime.cachedColdWaves = detectColdWaves(data, runtime.currentLabels);
    renderAll();
  }

  /**
   * 应用查询结果到 state/runtime 并渲染。
   * 返回 { hasData, errors, truncatedYears, forecastErrorYears }。
   */
  function applyResults(
    results: YearlyData[],
    query: { city: City; startMonthDay: string; endMonthDay: string },
  ): { hasData: boolean; errors: YearlyData[]; truncatedYears: number[]; forecastErrorYears: number[] } {
    const successData = results.filter((r) => !r.error);
    const errors = results.filter((r) => r.error);
    const truncatedYears = results.filter((r) => r.truncated && !r.error).map((r) => r.year);
    const forecastErrorYears = results.filter((r) => r.forecastError && !r.error).map((r) => r.year);

    state.yearlyData = successData;

    const hasData = successData.length > 0;
    if (hasData) {
      updateRuntime(successData, query);
    }

    return { hasData, errors, truncatedYears, forecastErrorYears };
  }

  function showMessageForResults(
    errors: YearlyData[],
    truncatedYears: number[],
    forecastErrorYears: number[],
  ): void {
    if (errors.length > 0) {
      failedYears = errors.map((e) => ({ year: e.year, error: e.error ?? '请求失败' }));
      const messages: string[] = [];
      messages.push(`数据获取失败：${errors.map((e) => `${e.year}年（${e.error}）`).join('；')}`);
      if (forecastErrorYears.length > 0) {
        messages.push(`${forecastErrorYears.join('、')}年的预报获取失败，已保留历史数据`);
      }
      message.showWithRetry(messages.join('。'), () => {
        void retryFailed();
      });
      return;
    }
    // 仅预报失败或截断时，不提供重试（历史数据已可用）
    failedYears = [];
    if (forecastErrorYears.length > 0) {
      message.show(`${forecastErrorYears.join('、')}年的预报获取失败，已保留历史数据`, 'error');
    } else if (truncatedYears.length > 0) {
      message.show(
        `提示：${truncatedYears.join('、')}年 所请求的未来日期超出 Open-Meteo 预报上限（约 15 天），超出部分无数据、已按可获取范围部分显示。`,
        'info',
      );
    } else {
      message.hide();
    }
  }

  async function handleQuery(): Promise<void> {
    if (state.selectedYears.length === 0) {
      message.show('请至少选择一个年份', 'error');
      return;
    }
    if (!state.startMonthDay || !state.endMonthDay) {
      message.show('请选择日期范围', 'error');
      return;
    }

    activeQueryController?.abort();
    const controller = new AbortController();
    activeQueryController = controller;
    const sequence = ++querySequence;
    const query = {
      city: { ...state.city },
      startMonthDay: state.startMonthDay,
      endMonthDay: state.endMonthDay,
      selectedYears: [...state.selectedYears],
    };
    lastQuery = query;

    state.loading = true;
    queryBtn.disabled = true;
    queryBtn.setAttribute('aria-busy', 'true');
    exportCsvBtn.disabled = true;
    message.hide();
    skeleton.show();

    const todayStr = formatDate(new Date());

    let results: YearlyData[];
    try {
      results = await fetchYears(query.selectedYears, query.city, query.startMonthDay, query.endMonthDay, todayStr, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      throw error;
    }
    if (sequence !== querySequence) return;

    state.loading = false;
    queryBtn.disabled = false;
    queryBtn.removeAttribute('aria-busy');
    activeQueryController = null;

    const { hasData, errors, truncatedYears, forecastErrorYears } = applyResults(results, query);

    // 查询成功有数据时启用导出按钮
    exportCsvBtn.disabled = !hasData;

    // 关键顺序：先调用所有 update() 把新内容渲染进仍 display:none 的内容容器，
    // 再 hideSkeletons() 一次性隐藏骨架 + 显示新内容 -> 避免旧内容闪现
    skeleton.hide();

    // 显隐各 section
    sections.chart.style.display = hasData ? '' : 'none';
    sections.stats.style.display = hasData ? '' : 'none';
    sections.extreme.style.display = hasData ? '' : 'none';
    sections.table.style.display = hasData ? '' : 'none';

    // 查询成功后把非默认条件写入 URL，方便分享
    if (hasData) {
      updateUrlFromState(query, state.tempType, defaults);
    }

    showMessageForResults(errors, truncatedYears, forecastErrorYears);
  }

  /**
   * 仅重发失败年份（任务 6）。
   * - 复用 lastQuery 的 city/startMonthDay/endMonthDay
   * - 成功的合并回 state.yearlyData，失败的保留 failedYears
   * - 不动 skeleton（保留当前数据显示），仅 btn disabled
   * - 复用 LRUCache：archive 永久缓存，重试可能直接命中
   * - 重试成功后重新检测所有年份的 truncated/forecastError 状态并重显提示（避免清空截断信息）
   */
  async function retryFailed(): Promise<void> {
    if (failedYears.length === 0 || !lastQuery) return;

    activeQueryController?.abort();
    const controller = new AbortController();
    activeQueryController = controller;
    const sequence = ++querySequence;

    state.loading = true;
    queryBtn.disabled = true;
    queryBtn.setAttribute('aria-busy', 'true');
    exportCsvBtn.disabled = true;
    message.hide();

    const todayStr = formatDate(new Date());
    const retryYears = failedYears.map((f) => f.year);

    let results: YearlyData[];
    try {
      results = await fetchYears(retryYears, lastQuery.city, lastQuery.startMonthDay, lastQuery.endMonthDay, todayStr, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      throw error;
    }
    if (sequence !== querySequence) return;

    state.loading = false;
    queryBtn.disabled = false;
    queryBtn.removeAttribute('aria-busy');
    activeQueryController = null;

    // 合并：用本次成功结果替换 state.yearlyData 中同年的失败记录
    const successResults = results.filter((r) => !r.error);
    const stillFailed = results.filter((r) => r.error);

    if (successResults.length > 0) {
      // 合并：state.yearlyData 本不含失败年份（handleQuery 已 filter），直接并入新成功结果（同年去重，新结果优先）
      const merged = new Map<number, YearlyData>();
      for (const y of state.yearlyData) merged.set(y.year, y);
      for (const y of successResults) merged.set(y.year, y);
      state.yearlyData = Array.from(merged.values()).sort((a, b) => a.year - b.year);

      updateRuntime(state.yearlyData, lastQuery);
      // 仍有数据，启用导出按钮
      exportCsvBtn.disabled = state.yearlyData.length === 0;
    }

    // 更新失败年份缓存
    failedYears = stillFailed.map((e) => ({ year: e.year, error: e.error ?? '请求失败' }));

    // 重试后重新检测所有年份的 truncated/forecastError 状态并重显提示（避免清空截断信息）。
    // 重试的年份可能恰好是 truncated 年份，重试成功后该年份仍应保留截断提示。
    const allTruncatedYears = state.yearlyData.filter((r) => r.truncated).map((r) => r.year);
    const allForecastErrorYears = state.yearlyData.filter((r) => r.forecastError).map((r) => r.year);

    if (failedYears.length > 0) {
      const messages: string[] = [];
      messages.push(`数据获取失败：${failedYears.map((e) => `${e.year}年（${e.error}）`).join('；')}`);
      if (allForecastErrorYears.length > 0) {
        messages.push(`${allForecastErrorYears.join('、')}年的预报获取失败，已保留历史数据`);
      }
      message.showWithRetry(messages.join('。'), () => {
        void retryFailed();
      });
    } else if (allForecastErrorYears.length > 0) {
      message.show(`${allForecastErrorYears.join('、')}年的预报获取失败，已保留历史数据`, 'error');
      // 全部失败年份已成功后更新 URL
      updateUrlFromState(lastQuery, state.tempType, defaults);
    } else if (allTruncatedYears.length > 0) {
      message.show(
        `提示：${allTruncatedYears.join('、')}年 所请求的未来日期超出 Open-Meteo 预报上限（约 15 天），超出部分无数据、已按可获取范围部分显示。`,
        'info',
      );
      updateUrlFromState(lastQuery, state.tempType, defaults);
    } else {
      message.hide();
      updateUrlFromState(lastQuery, state.tempType, defaults);
    }
  }

  return { handleQuery, retryFailed, hasFailedYears };
}

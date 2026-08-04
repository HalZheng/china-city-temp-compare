import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { HistoricalWeatherResponse } from './types';

// Mock Open-Meteo API：fetchYearData 内部调用这两个函数
vi.mock('./api/open-meteo', () => ({
  fetchHistoricalWeather: vi.fn(),
  fetchForecastWeather: vi.fn(),
  // router.ts 间接依赖 searchCities，但 fetchYearData 不调；提供空实现避免导入报错
  searchCities: vi.fn(),
  reverseGeocode: vi.fn(),
}));

import { fetchHistoricalWeather, fetchForecastWeather } from './api/open-meteo';
import { fetchYearData } from './query';

const city = { name: 'test', latitude: 30, longitude: 120 };
const controller = new AbortController();

function mockArchive(start: string, end: string, maxTemps: (number | null)[], minTemps: (number | null)[]): HistoricalWeatherResponse {
  const time: string[] = [];
  const cur = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cur <= last) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    time.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return { daily: { time, temperature_2m_max: maxTemps, temperature_2m_min: minTemps } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchYearData', () => {
  it('纯历史段：仅调 archive，不调 forecast，truncated=false', async () => {
    // 2023-06-01 ~ 2023-06-02，today=2024-06-15，整段都在历史
    vi.mocked(fetchHistoricalWeather).mockResolvedValue(
      mockArchive('2023-06-01', '2023-06-02', [30, 31], [20, 21]),
    );
    const result = await fetchYearData(city, 2023, '06-01', '06-02', '2024-06-15', controller.signal);
    expect(fetchHistoricalWeather).toHaveBeenCalledTimes(1);
    expect(fetchHistoricalWeather).toHaveBeenCalledWith(city, '2023-06-01', '2023-06-02', controller.signal);
    expect(fetchForecastWeather).not.toHaveBeenCalled();
    expect(result.maxTemps).toEqual([30, 31]);
    expect(result.minTemps).toEqual([20, 21]);
    expect(result.forecastFlags).toEqual([false, false]);
    expect(result.truncated).toBe(false);
    expect(result.forecastError).toBe(false);
  });

  it('纯未来段：仅调 forecast，不调 archive', async () => {
    // 2024-06-20 ~ 2024-06-21，today=2024-06-15，整段都在未来且在 horizon 内
    vi.mocked(fetchForecastWeather).mockResolvedValue(
      mockArchive('2024-06-20', '2024-06-21', [32, 33], [22, 23]),
    );
    const result = await fetchYearData(city, 2024, '06-20', '06-21', '2024-06-15', controller.signal);
    expect(fetchForecastWeather).toHaveBeenCalledTimes(1);
    expect(fetchHistoricalWeather).not.toHaveBeenCalled();
    expect(result.maxTemps).toEqual([32, 33]);
    expect(result.forecastFlags).toEqual([true, true]);
    expect(result.truncated).toBe(false);
  });

  it('跨年纯历史区间：archive 调 2 次（两段都属历史），不调 forecast', async () => {
    // 2023-12-30 ~ 2024-01-02，today=2024-06-15，两段都历史
    vi.mocked(fetchHistoricalWeather).mockResolvedValueOnce(
      mockArchive('2023-12-30', '2023-12-31', [5, 4], [-2, -3]),
    );
    vi.mocked(fetchHistoricalWeather).mockResolvedValueOnce(
      mockArchive('2024-01-01', '2024-01-02', [3, 2], [-4, -5]),
    );
    const result = await fetchYearData(city, 2023, '12-30', '01-02', '2024-06-15', controller.signal);
    expect(fetchHistoricalWeather).toHaveBeenCalledTimes(2);
    expect(fetchForecastWeather).not.toHaveBeenCalled();
    // labels 顺序：12-30, 12-31, 01-01, 01-02
    expect(result.dates).toEqual(['12-30', '12-31', '01-01', '01-02']);
    expect(result.maxTemps).toEqual([5, 4, 3, 2]);
    expect(result.minTemps).toEqual([-2, -3, -4, -5]);
    expect(result.truncated).toBe(false);
  });

  it('历史+未来混合段：archive 和 forecast 各调 1 次', async () => {
    // 2024-06-10 ~ 2024-06-20，today=2024-06-15
    // 历史段 06-10~06-15（archive），未来段 06-16~06-20（forecast，在 horizon 06-30 内）
    vi.mocked(fetchHistoricalWeather).mockResolvedValueOnce(
      mockArchive('2024-06-10', '2024-06-15', [28, 29, 30, 31, 32, 33], [18, 19, 20, 21, 22, 23]),
    );
    vi.mocked(fetchForecastWeather).mockResolvedValueOnce(
      mockArchive('2024-06-16', '2024-06-20', [34, 33, 32, 31, 30], [24, 23, 22, 21, 20]),
    );
    const result = await fetchYearData(city, 2024, '06-10', '06-20', '2024-06-15', controller.signal);
    expect(fetchHistoricalWeather).toHaveBeenCalledTimes(1);
    expect(fetchForecastWeather).toHaveBeenCalledTimes(1);
    // 11 天：前 6 天历史，后 5 天预报
    expect(result.maxTemps).toEqual([28, 29, 30, 31, 32, 33, 34, 33, 32, 31, 30]);
    // forecastFlags：前 6 天 false，后 5 天 true（注意 06-15 是历史，06-16 起是预报）
    expect(result.forecastFlags).toEqual([false, false, false, false, false, false, true, true, true, true, true]);
    expect(result.truncated).toBe(false);
  });

  it('forecast 请求失败：forecastError=true，历史段数据保留', async () => {
    // 2024-06-10 ~ 2024-06-20，today=2024-06-15
    vi.mocked(fetchHistoricalWeather).mockResolvedValueOnce(
      mockArchive('2024-06-10', '2024-06-15', [28, 29, 30, 31, 32, 33], [18, 19, 20, 21, 22, 23]),
    );
    vi.mocked(fetchForecastWeather).mockRejectedValueOnce(new Error('HTTP 429'));
    const result = await fetchYearData(city, 2024, '06-10', '06-20', '2024-06-15', controller.signal);
    expect(result.forecastError).toBe(true);
    expect(result.truncated).toBe(false);
    // 历史段 06-10~06-15 有值（6天），未来段 06-16~06-20 为 null（5天）
    expect(result.maxTemps.slice(0, 6)).toEqual([28, 29, 30, 31, 32, 33]);
    expect(result.maxTemps.slice(6)).toEqual([null, null, null, null, null]);
  });

  it('segEnd 超出 horizon：truncated=true，forecast 请求收敛到 horizon 内', async () => {
    // 2024-06-20 ~ 2024-07-10，today=2024-06-15，horizon=2024-06-30
    // 未来段 06-20~06-30（forecast 收敛到 horizon），06-30~07-10 无数据
    vi.mocked(fetchForecastWeather).mockResolvedValueOnce(
      mockArchive('2024-06-20', '2024-06-30', Array(11).fill(30), Array(11).fill(20)),
    );
    const result = await fetchYearData(city, 2024, '06-20', '07-10', '2024-06-15', controller.signal);
    expect(result.truncated).toBe(true);
    // forecast futStart = max(segStart '06-20', tomorrow '06-16') = '06-20'，futEnd 收敛到 horizon '06-30'
    expect(fetchForecastWeather).toHaveBeenCalledWith(city, '2024-06-20', '2024-06-30', controller.signal);
  });

  it('segEnd 在 horizon 内：truncated=false', async () => {
    // 2024-06-20 ~ 2024-06-21，today=2024-06-15，horizon=2024-06-30，segEnd < horizon
    vi.mocked(fetchForecastWeather).mockResolvedValueOnce(
      mockArchive('2024-06-20', '2024-06-21', [32, 33], [22, 23]),
    );
    const result = await fetchYearData(city, 2024, '06-20', '06-21', '2024-06-15', controller.signal);
    expect(result.truncated).toBe(false);
  });

  it('跨年段含历史+未来：第一段历史，第二段未来', async () => {
    // 2024-12-30 ~ 2025-01-02，today=2024-12-31
    // 段1: 2024-12-30~2024-12-31（历史，archive）
    // 段2: 2025-01-01~2025-01-02（未来，forecast，在 horizon 2025-01-15 内）
    vi.mocked(fetchHistoricalWeather).mockResolvedValueOnce(
      mockArchive('2024-12-30', '2024-12-31', [5, 4], [-2, -3]),
    );
    vi.mocked(fetchForecastWeather).mockResolvedValueOnce(
      mockArchive('2025-01-01', '2025-01-02', [3, 2], [-4, -5]),
    );
    const result = await fetchYearData(city, 2024, '12-30', '01-02', '2024-12-31', controller.signal);
    expect(fetchHistoricalWeather).toHaveBeenCalledTimes(1);
    expect(fetchForecastWeather).toHaveBeenCalledTimes(1);
    // labels: 12-30, 12-31, 01-01, 01-02
    expect(result.maxTemps).toEqual([5, 4, 3, 2]);
    expect(result.forecastFlags).toEqual([false, false, true, true]);
    expect(result.truncated).toBe(false);
  });

  it('AbortSignal 触发时抛出 AbortError', async () => {
    const localController = new AbortController();
    vi.mocked(fetchHistoricalWeather).mockImplementation(() => {
      localController.abort();
      throw new DOMException('Aborted', 'AbortError');
    });
    await expect(
      fetchYearData(city, 2023, '06-01', '06-02', '2024-06-15', localController.signal),
    ).rejects.toThrow('Aborted');
  });
});

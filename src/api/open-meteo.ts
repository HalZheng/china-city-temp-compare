import type { GeocodingResponse, HistoricalWeatherResponse, City } from '../types';
import { LRUCache } from '../utils/lru-cache';

const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';
const ARCHIVE_API = 'https://archive-api.open-meteo.com/v1/archive';
// responseCache：archive 永久缓存（幂等），forecast 10 分钟 TTL；上限 50 条 LRU 淘汰
const responseCache = new LRUCache<string, HistoricalWeatherResponse>(50);
// geocodingCache：1 小时 TTL，避免瞬时错误返回的空结果被永久缓存
const geocodingCache = new LRUCache<string, GeocodingResponse>(50, 60 * 60 * 1000);

async function fetchWithRetry(url: string, attempts = 3, externalSignal?: AbortSignal): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    // 外部 abort（用户取消查询）直接终止，不重试
    if (externalSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    // 外部 abort 同步传导到本次 fetch
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      window.clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('请求失败');
}

async function fetchWeather(url: URL, signal: AbortSignal | undefined, ttlMs: number): Promise<HistoricalWeatherResponse> {
  const key = url.toString();
  const cached = responseCache.get(key);
  if (cached) return cached;

  const response = await fetchWithRetry(key, 3, signal);
  const data = await response.json() as HistoricalWeatherResponse;
  responseCache.set(key, data, ttlMs);
  return data;
}

export async function searchCities(name: string): Promise<GeocodingResponse> {
  const url = new URL(GEOCODING_API);
  url.searchParams.set('name', name);
  url.searchParams.set('count', '10');
  url.searchParams.set('language', 'zh');
  url.searchParams.set('countryCode', 'CN');

  const key = url.toString();
  const cached = geocodingCache.get(key);
  if (cached) return cached;

  const response = await fetchWithRetry(key);
  if (!response.ok) {
    throw new Error(`Geocoding API error: ${response.status}`);
  }
  const data = await response.json() as GeocodingResponse;
  // 不缓存空结果：Open-Meteo 偶有瞬时错误返回空 results，缓存会导致后续同名搜索始终返回空
  if (data.results && data.results.length > 0) {
    geocodingCache.set(key, data);
  }
  return data;
}

export interface ReverseGeocodeResult {
  city: string;
  locality: string;
  principalSubdivision: string;
  countryName: string;
  latitude: number;
  longitude: number;
}

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=zh`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Reverse geocoding error: ${response.status}`);
  }
  return response.json();
}

export async function fetchHistoricalWeather(
  city: City,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<HistoricalWeatherResponse> {
  const url = new URL(ARCHIVE_API);
  url.searchParams.set('latitude', city.latitude.toString());
  url.searchParams.set('longitude', city.longitude.toString());
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
  url.searchParams.set('timezone', 'Asia/Shanghai');

  return fetchWeather(url, signal, Number.POSITIVE_INFINITY);
}

const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';

export async function fetchForecastWeather(
  city: City,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<HistoricalWeatherResponse> {
  const url = new URL(FORECAST_API);
  url.searchParams.set('latitude', city.latitude.toString());
  url.searchParams.set('longitude', city.longitude.toString());
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
  url.searchParams.set('timezone', 'Asia/Shanghai');

  return fetchWeather(url, signal, 10 * 60 * 1000);
}

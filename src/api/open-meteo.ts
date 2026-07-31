import type { GeocodingResponse, HistoricalWeatherResponse, City } from '../types';

const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';
const ARCHIVE_API = 'https://archive-api.open-meteo.com/v1/archive';
const responseCache = new Map<string, { expiresAt: number; data: HistoricalWeatherResponse }>();
const geocodingCache = new Map<string, GeocodingResponse>();

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      window.clearTimeout(timeout);
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
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const response = await fetch(key, { signal });
  if (!response.ok) throw new Error(`Weather API error: ${response.status}`);

  const data = await response.json() as HistoricalWeatherResponse;
  responseCache.set(key, { expiresAt: Date.now() + ttlMs, data });
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
  geocodingCache.set(key, data);
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

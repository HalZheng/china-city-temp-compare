import type { GeocodingResponse, HistoricalWeatherResponse, City } from '../types';

const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';
const ARCHIVE_API = 'https://archive-api.open-meteo.com/v1/archive';

export async function searchCities(name: string): Promise<GeocodingResponse> {
  const url = new URL(GEOCODING_API);
  url.searchParams.set('name', name);
  url.searchParams.set('count', '10');
  url.searchParams.set('language', 'zh');
  url.searchParams.set('countryCode', 'CN');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Geocoding API error: ${response.status}`);
  }
  return response.json();
}

export async function fetchHistoricalWeather(
  city: City,
  startDate: string,
  endDate: string
): Promise<HistoricalWeatherResponse> {
  const url = new URL(ARCHIVE_API);
  url.searchParams.set('latitude', city.latitude.toString());
  url.searchParams.set('longitude', city.longitude.toString());
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
  url.searchParams.set('timezone', 'Asia/Shanghai');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Archive API error: ${response.status}`);
  }
  return response.json();
}

const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';

export async function fetchForecastWeather(
  city: City,
  startDate: string,
  endDate: string
): Promise<HistoricalWeatherResponse> {
  const url = new URL(FORECAST_API);
  url.searchParams.set('latitude', city.latitude.toString());
  url.searchParams.set('longitude', city.longitude.toString());
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
  url.searchParams.set('timezone', 'Asia/Shanghai');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Forecast API error: ${response.status}`);
  }
  return response.json();
}

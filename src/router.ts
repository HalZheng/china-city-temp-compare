import type { City, TempType, AppState, GeocodingResponse } from './types';
import { searchCities as defaultSearchCities } from './api/open-meteo';

/**
 * URL 路由模块：读写查询条件，分享链接可复现。
 * - applyUrlParams: 解析 URL 查询参数（city/lat/lng/start/end/years/type），应用到 state 和各控件
 * - updateUrlFromState: 把非默认查询条件写入 URL（replaceState）
 * - parseCityFromParam: 解析 city 参数（支持 current:lat,lng 或 城市名+lat/lng 两种形式）
 */

export interface RouterDeps {
  state: AppState;
  citySearch: { update: (city: City) => City };
  dateRangePicker: { setRange: (start: string, end: string) => void };
  yearSelector: { setYears: (years: number[]) => void };
  setTempType: (type: TempType) => void;
  /** 可选覆盖，便于测试 mock */
  searchCitiesFn?: (name: string) => Promise<GeocodingResponse>;
  defaults: {
    startMonthDay: string;
    endMonthDay: string;
    years: number[];
    fallbackCity: City;
  };
}

export interface ApplyUrlResult {
  hasValidCity: boolean;
  /** 解析得到的规范化城市（含坐标）；调用方据此更新 defaultCity */
  resolvedCity?: City;
}

export function parseCityFromParam(value: string, params: URLSearchParams): City | null {
  if (value.startsWith('current:')) {
    const [lat, lng] = value.slice(8).split(',').map(Number);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      return { name: '当前位置', latitude: lat, longitude: lng };
    }
    return null;
  }
  const latitudeParam = params.get('lat');
  const longitudeParam = params.get('lng');
  if (!value || latitudeParam === null || longitudeParam === null) return null;
  const latitude = Number(latitudeParam);
  const longitude = Number(longitudeParam);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { name: value, latitude, longitude };
}

export async function applyUrlParams(deps: RouterDeps): Promise<ApplyUrlResult> {
  const { state, citySearch, dateRangePicker, yearSelector, setTempType } = deps;
  const searchCitiesFn = deps.searchCitiesFn ?? defaultSearchCities;
  const params = new URLSearchParams(location.search);
  let hasValidCity = false;
  let resolvedCity: City | undefined;

  const cityParam = params.get('city');
  if (cityParam) {
    let parsed = parseCityFromParam(cityParam, params);
    if (!parsed) {
      try {
        const response = await searchCitiesFn(cityParam);
        const result = response.results?.[0];
        if (result) parsed = { name: cityParam, latitude: result.latitude, longitude: result.longitude };
      } catch {
        // 旧链接解析失败时保持默认城市，并允许浏览器定位接管。
      }
    }
    if (parsed) {
      hasValidCity = true;
      state.city = parsed;
      const normalizedCity = citySearch.update(parsed);
      state.city = normalizedCity;
      resolvedCity = normalizedCity;
    }
  }

  const startParam = params.get('start');
  const endParam = params.get('end');
  const monthDayPattern = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  const isValidMonthDay = (value: string) =>
    monthDayPattern.test(value) && formatDate(new Date(`2000-${value}T00:00:00`)).slice(5) === value;
  if (startParam && endParam && isValidMonthDay(startParam) && isValidMonthDay(endParam)) {
    state.startMonthDay = startParam;
    state.endMonthDay = endParam;
    dateRangePicker.setRange(startParam, endParam);
  }

  const yearsParam = params.get('years');
  if (yearsParam) {
    const years = yearsParam
      .split(',')
      .map((y) => parseInt(y, 10))
      .filter((y) => !Number.isNaN(y));
    if (years.length > 0) {
      yearSelector.setYears(years);
    }
  }

  const typeParam = params.get('type') as TempType | null;
  if (typeParam === 'max' || typeParam === 'min') {
    setTempType(typeParam);
  }

  return { hasValidCity, resolvedCity };
}

export function updateUrlFromState(
  query: { city: City; startMonthDay: string; endMonthDay: string; selectedYears: number[] },
  tempType: TempType,
  defaults: { startMonthDay: string; endMonthDay: string; years: number[]; fallbackCity: City },
): void {
  const params = new URLSearchParams();

  const isFallbackCity =
    query.city.name === defaults.fallbackCity.name &&
    query.city.latitude === defaults.fallbackCity.latitude &&
    query.city.longitude === defaults.fallbackCity.longitude;
  if (!isFallbackCity) {
    params.set('city', query.city.name);
    params.set('lat', query.city.latitude.toFixed(4));
    params.set('lng', query.city.longitude.toFixed(4));
  }

  if (query.startMonthDay && query.endMonthDay) {
    if (query.startMonthDay !== defaults.startMonthDay || query.endMonthDay !== defaults.endMonthDay) {
      params.set('start', query.startMonthDay);
      params.set('end', query.endMonthDay);
    }
  }

  const yearsStr = query.selectedYears.join(',');
  const defaultYearsStr = defaults.years.join(',');
  if (yearsStr && yearsStr !== defaultYearsStr) {
    params.set('years', yearsStr);
  }

  if (tempType !== 'max') {
    params.set('type', tempType);
  }

  const queryString = params.toString();
  const newUrl = queryString ? `${location.pathname}?${queryString}` : location.pathname;
  window.history.replaceState({}, '', newUrl);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

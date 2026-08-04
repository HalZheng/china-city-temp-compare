import type { AppState, City } from './types';
import { reverseGeocode } from './api/open-meteo';

/**
 * 地理定位模块：获取当前位置并切换默认城市。
 * - 成功后通过 reverseGeocode 取中文名，去掉行政区划后缀，更新 state.city 并触发查询
 * - 若用户已手动选城市（isCitySelectedByUser 返回 true），放弃定位结果
 * - 失败时使用裸坐标"当前位置"作为城市名
 * - onCityResolved 回调通知调用方更新 defaultCity
 */
export interface GeolocationDeps {
  state: AppState;
  citySearch: { update: (city: City) => City };
  handleQuery: () => void;
  /** 返回 true 表示用户已手动选城市，定位结果应被忽略 */
  isCitySelectedByUser: () => boolean;
  /** 定位成功后通知调用方更新 defaultCity */
  onCityResolved?: (city: City) => void;
}

export function initGeolocation(deps: GeolocationDeps): void {
  const { state, citySearch, handleQuery, isCitySelectedByUser, onCityResolved } = deps;
  if (!('geolocation' in navigator)) return;
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      if (isCitySelectedByUser()) return;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      try {
        const geo = await reverseGeocode(lat, lng);
        // 优先使用城市名，去掉常见行政区划后缀，保证搜索框显示真实中文地区名称
        const rawName = geo.city || geo.locality || '当前位置';
        const locationName = rawName.replace(/(市|区|县|自治州|地区|盟)$/, '') || rawName;
        const currentCity: City = {
          name: locationName,
          latitude: lat,
          longitude: lng,
        };
        const normalizedCity = citySearch.update(currentCity);
        state.city = normalizedCity;
        onCityResolved?.(normalizedCity);
        handleQuery();
      } catch {
        const currentCity: City = {
          name: '当前位置',
          latitude: lat,
          longitude: lng,
        };
        const normalizedCity = citySearch.update(currentCity);
        state.city = normalizedCity;
        onCityResolved?.(normalizedCity);
        handleQuery();
      }
    },
    () => {
      // 获取失败时保持默认城市
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
  );
}

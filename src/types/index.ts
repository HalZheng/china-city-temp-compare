export interface City {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
}

export interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
}

export interface GeocodingResponse {
  results?: GeocodingResult[];
}

export interface HistoricalWeatherResponse {
  daily: {
    time: string[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
  };
}

export interface YearlyData {
  year: number;
  /** 与 labels 对齐的月日标签序列（所有年份共用同一序列） */
  dates: string[];
  maxTemps: (number | null)[];
  minTemps: (number | null)[];
  /** 与 dates 对齐，true 表示该天为预报（未来）数据 */
  forecastFlags: boolean[];
  /** true 表示所请求的未来日期超出预报接口上限，超出部分无数据 */
  truncated?: boolean;
  error?: string;
}

export type TempType = 'max' | 'min';

export interface AppState {
  city: City;
  startMonthDay: string;
  endMonthDay: string;
  selectedYears: number[];
  tempType: TempType;
  yearlyData: YearlyData[];
  loading: boolean;
}

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
  /** true 表示未来段请求失败，历史数据仍可用 */
  forecastError?: boolean;
  error?: string;
}

export type TempType = 'max' | 'min';

export type ColdWaveKind = 'coldwave' | 'severe_cold';

/** 一次高温热浪过程（按 MM-DD 对齐，跨年段用 calendar 年标注） */
export interface HeatwavePeriod {
  year: number;
  startMd: string;
  endMd: string;
  startDate: string;
  endDate: string;
  startDay: number;
  endDay: number;
  duration: number;
  avgMax: number;
  includesForecast: boolean;
}

export interface ColdWavePeriod {
  year: number;
  kind: ColdWaveKind;
  startMd: string;
  endMd: string;
  startDate: string;
  endDate: string;
  startDay: number;
  endDay: number;
  duration: number;
  avgMin: number;
  includesForecast: boolean;
}

export interface SummaryStats {
  /** 区间平均气温（跟随 tempType，跨所有年份有效值） */
  periodAvg: number | null;
  hotDays: number;
  tropicalNights: number;
  heatwaveCount: number;
  freezingDays: number;
  extremeColdNights: number;
  coldWaveCount: number;
  severeColdCount: number;
}

export interface YearSummaryStats extends SummaryStats {
  year: number;
  includesForecast: boolean;
}

export interface YearAverage {
  year: number;
  average: number | null;
}

export interface AppState {
  city: City;
  startMonthDay: string;
  endMonthDay: string;
  selectedYears: number[];
  tempType: TempType;
  yearlyData: YearlyData[];
  loading: boolean;
}

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
  dates: string[];
  maxTemps: (number | null)[];
  minTemps: (number | null)[];
  error?: string;
  forecastIndices?: Set<number>;
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

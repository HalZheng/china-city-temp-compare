export function getRecentYears(count: number, excludeCurrent: boolean = true): number[] {
  const currentYear = new Date().getFullYear();
  const start = excludeCurrent ? currentYear - 1 : currentYear;
  const years: number[] = [];
  for (let i = 0; i < count; i++) {
    years.push(start - i);
  }
  return years.sort((a, b) => a - b);
}

export function formatMonthDay(dateStr: string): string {
  return dateStr.substring(5);
}

export function generateYearColors(years: number[]): Record<number, string> {
  const colors: Record<number, string> = {};
  const hueStep = 360 / Math.max(years.length, 1);
  years.forEach((year, index) => {
    const hue = (index * hueStep) % 360;
    colors[year] = `hsl(${hue}, 70%, 50%)`;
  });
  return colors;
}

export function validateMonthDayRange(start: string, end: string): boolean {
  return start <= end;
}

export function getDefaultDateRange(): { start: string; end: string } {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 10);
  const end = new Date(today);
  end.setDate(end.getDate() + 10);
  return { start: formatDate(start), end: formatDate(end) };
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getMonthDayFromDate(dateStr: string): string {
  return dateStr.substring(5);
}

export function buildDateForYear(monthDay: string, year: number): string {
  return `${year}-${monthDay}`;
}

const TEMP_PALETTE = [
  '#dc2626', // 0 最热 - 红
  '#f97316', // 1 - 橙红
  '#f59e0b', // 2 - 橙
  '#eab308', // 3 - 黄
  '#84cc16', // 4 - 黄绿
  '#14b8a6', // 5 - 青绿
  '#06b6d4', // 6 - 青
  '#3b82f6', // 7 - 蓝
  '#6366f1', // 8 - 靛蓝
  '#a855f7', // 9 最冷 - 紫
];

export function assignColorsByAverageTemp(yearAvgTemps: { year: number; avgTemp: number }[]): Record<number, string> {
  if (yearAvgTemps.length === 0) return {};
  const sorted = [...yearAvgTemps].sort((a, b) => b.avgTemp - a.avgTemp);

  const colors: Record<number, string> = {};
  sorted.forEach((item, index) => {
    const ratio = index / Math.max(sorted.length - 1, 1);
    const colorIndex = Math.round(ratio * (TEMP_PALETTE.length - 1));
    colors[item.year] = TEMP_PALETTE[colorIndex];
  });
  return colors;
}

export function getTemperatureColor(temp: number): string | null {
  if (temp >= 35) return '#dc2626';
  if (temp >= 30) return '#ea580c';
  return null;
}

export function filterDateRange(response: { daily: { time: string[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[] } }, startDate: string, endDate: string): { daily: { time: string[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[] } } {
  const indices: number[] = [];
  response.daily.time.forEach((t, i) => {
    if (t >= startDate && t <= endDate) {
      indices.push(i);
    }
  });
  return {
    daily: {
      time: indices.map((i) => response.daily.time[i]),
      temperature_2m_max: indices.map((i) => response.daily.temperature_2m_max[i]),
      temperature_2m_min: indices.map((i) => response.daily.temperature_2m_min[i]),
    },
  };
}

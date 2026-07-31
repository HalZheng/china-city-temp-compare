/** 读取 CSS 变量的当前计算值（用于 ECharts 等无法直接用 var() 的场景） */
export function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

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

/** 月日区间是否跨年（如 12-01 > 02-28） */
export function isWrappingRange(startMonthDay: string, endMonthDay: string): boolean {
  return startMonthDay > endMonthDay;
}

/**
 * 生成区间内统一的月日(MM-DD)标签序列，作为所有年份对齐的 X 轴。
 * 使用闰年参考年(2000)生成，确保区间内包含 02-29 时标签也包含它；
 * 非闰年年份对应 02-29 的数据自然为 null，从而实现正确对齐。
 */
export function buildMonthDayLabels(startMonthDay: string, endMonthDay: string): string[] {
  const mdOf = (dateStr: string) => dateStr.substring(5);
  const labels: string[] = [];
  const pushRange = (from: Date, to: Date) => {
    const cur = new Date(from);
    while (cur <= to) {
      labels.push(mdOf(formatDate(cur)));
      cur.setDate(cur.getDate() + 1);
    }
  };
  if (!isWrappingRange(startMonthDay, endMonthDay)) {
    pushRange(new Date(`2000-${startMonthDay}`), new Date(`2000-${endMonthDay}`));
  } else {
    pushRange(new Date(`2000-${startMonthDay}`), new Date(`2000-12-31`));
    pushRange(new Date(`2001-01-01`), new Date(`2001-${endMonthDay}`));
  }
  return labels;
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

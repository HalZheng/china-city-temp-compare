import type { YearlyData } from '../types';

/**
 * 将查询结果导出为 CSV（宽格式，与详情表一致）。
 * - 列：日期, {年份}年最高, {年份}年最低, ...（每年两列）
 * - 行：按 labels 顺序，跨年处插入空行分隔
 * - 预报数据用 * 标记（如 "32.5*"），与表格的"预"标记对应
 * - 单元格为空表示该年该日无数据
 *
 * @param data 年份数据数组
 * @param labels 月日标签序列（MM-DD）
 * @param cityName 城市名（写入文件名与表头说明）
 * @param rangeStr 区间描述（写入文件名，如 "06-01_08-31"）
 * @returns { filename, content } 用于触发下载
 */
export function buildYearlyCsv(
  data: YearlyData[],
  labels: string[],
  cityName: string,
  rangeStr: string,
): { filename: string; content: string } {
  // 找到跨年分隔点（12-xx → 01-xx）
  const splitIndex = labels.findIndex(
    (md, i) => i > 0 && labels[i - 1].startsWith('12-') && md.startsWith('01-'),
  );

  const rows: string[][] = [];

  // 表头：日期, 2024年最高, 2024年最低, 2023年最高, 2023年最低, ...
  const header = ['日期'];
  for (const yd of data) {
    header.push(`${yd.year}年最高(℃)`, `${yd.year}年最低(℃)`);
  }
  rows.push(header);

  // 数据行
  for (let i = 0; i < labels.length; i++) {
    if (splitIndex >= 0 && i === splitIndex) {
      // 跨年分隔：空行
      rows.push([]);
    }
    const row: string[] = [labels[i]];
    for (const yd of data) {
      const max = yd.maxTemps[i];
      const min = yd.minTemps[i];
      const isForecast = yd.forecastFlags[i];
      row.push(formatTemp(max, isForecast));
      row.push(formatTemp(min, isForecast));
    }
    rows.push(row);
  }

  const content = rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
  const filename = `${cityName}_${rangeStr}.csv`;
  return { filename, content };
}

function formatTemp(temp: number | null | undefined, isForecast: boolean): string {
  if (temp == null || Number.isNaN(temp)) return '';
  const s = String(temp);
  return isForecast ? `${s}*` : s;
}

/** RFC 4180 转义：含逗号、引号、换行时用双引号包裹，内部引号双写 */
function escapeCsvCell(cell: string): string {
  if (cell === '') return '';
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/**
 * 触发浏览器下载 CSV 文件（UTF-8 BOM 确保 Excel 正确识别中文）。
 */
export function downloadCsv(filename: string, content: string): void {
  const bom = '\uFEFF'; // UTF-8 BOM
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 延迟释放，避免某些浏览器下载未完成
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

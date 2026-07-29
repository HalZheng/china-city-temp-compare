import './style.css';
import type { City, AppState, TempType, YearlyData } from './types';
import { CitySearch } from './components/CitySearch';
import { DateRangePicker } from './components/DateRangePicker';
import { YearSelector } from './components/YearSelector';
import { TempChart } from './components/TempChart';
import { DataTable } from './components/DataTable';
import { fetchHistoricalWeather, fetchForecastWeather } from './api/open-meteo';
import { formatDate, buildMonthDayLabels, isWrappingRange, assignColorsByAverageTemp } from './utils/helpers';

const defaultCity: City = {
  name: '大连',
  latitude: 38.92,
  longitude: 121.62,
};

const state: AppState = {
  city: defaultCity,
  startMonthDay: '',
  endMonthDay: '',
  selectedYears: [],
  tempType: 'max',
  yearlyData: [],
  loading: false,
};

let currentYearColors: Record<number, string> = {};
let currentLabels: string[] = [];

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '';

// Header
const header = document.createElement('header');
header.className = 'app-header';
const title = document.createElement('h1');
title.textContent = '中国城市历年气温对比';
header.appendChild(title);
app.appendChild(header);

// Controls
const controls = document.createElement('section');
controls.className = 'controls';

const citySearch = CitySearch({
  onSelect: (city) => {
    state.city = city;
  },
  defaultCity,
});

const dateRangePicker = DateRangePicker({
  onChange: (start, end) => {
    state.startMonthDay = start;
    state.endMonthDay = end;
  },
});

const yearSelector = YearSelector({
  onChange: (years) => {
    state.selectedYears = years;
  },
});

const queryBtn = document.createElement('button');
queryBtn.type = 'button';
queryBtn.textContent = '查询';
queryBtn.className = 'query-btn';

controls.appendChild(citySearch);
controls.appendChild(dateRangePicker);
controls.appendChild(yearSelector);
controls.appendChild(queryBtn);
app.appendChild(controls);

// Loading
const loadingEl = document.createElement('div');
loadingEl.className = 'loading';
loadingEl.textContent = '加载中...';
loadingEl.style.display = 'none';
app.appendChild(loadingEl);

// Chart section
const chartSection = document.createElement('section');
chartSection.className = 'chart-section';

const tabContainer = document.createElement('div');
tabContainer.className = 'tab-container';

const maxTab = document.createElement('button');
maxTab.type = 'button';
maxTab.textContent = '最高气温';
maxTab.className = 'tab active';

const minTab = document.createElement('button');
minTab.type = 'button';
minTab.textContent = '最低气温';
minTab.className = 'tab';

function setTempType(type: TempType) {
  state.tempType = type;
  if (type === 'max') {
    maxTab.classList.add('active');
    minTab.classList.remove('active');
  } else {
    minTab.classList.add('active');
    maxTab.classList.remove('active');
  }
  if (state.yearlyData.length > 0) {
    chart.update(state.yearlyData, state.tempType, currentYearColors, state.city.name, currentLabels);
  }
}

maxTab.addEventListener('click', () => setTempType('max'));
minTab.addEventListener('click', () => setTempType('min'));

tabContainer.appendChild(maxTab);
tabContainer.appendChild(minTab);
chartSection.appendChild(tabContainer);

const chartContainer = document.createElement('div');
chartContainer.className = 'chart-container';
chartSection.appendChild(chartContainer);
app.appendChild(chartSection);

const chart = TempChart({ container: chartContainer });

// Table section
const tableSection = document.createElement('section');
tableSection.className = 'table-section';
const tableTitle = document.createElement('h2');
tableTitle.textContent = '详细数据';
tableSection.appendChild(tableTitle);
const tableContainer = document.createElement('div');
tableContainer.className = 'table-container';
tableSection.appendChild(tableContainer);
app.appendChild(tableSection);

const dataTable = DataTable({ container: tableContainer });

// Footer
const footer = document.createElement('footer');
footer.className = 'app-footer';
footer.innerHTML = '<p>数据来源: <a href="https://open-meteo.com/" target="_blank">Open-Meteo</a></p>';
app.appendChild(footer);

// 错误/提示横幅
const messageEl = document.createElement('div');
messageEl.className = 'message-banner';
messageEl.style.display = 'none';
app.appendChild(messageEl);

function showMessage(text: string, type: 'error' | 'info' = 'error') {
  messageEl.textContent = text;
  messageEl.className = `message-banner message-${type}`;
  messageEl.style.display = 'block';
}

function hideMessage() {
  messageEl.style.display = 'none';
}

const mdOf = (dateStr: string) => dateStr.substring(5);

/**
 * 获取某一年的气温数据并标准化为"月日对齐"的结构。
 * - 跨年区间拆为"起始年段"与"次年段"分别取数；
 * - 当年区间按"今天"拆分为历史段(archive)与未来段(forecast)，避免整段走 forecast 导致历史数据丢失；
 * - 最终按统一的月日标签对齐，闰年差异自然表现为 null。
 */
async function fetchYearData(
  city: City,
  year: number,
  startMonthDay: string,
  endMonthDay: string,
  todayStr: string,
): Promise<YearlyData> {
  const wrap = isWrappingRange(startMonthDay, endMonthDay);
  const segments: [string, string][] = [];
  if (!wrap) {
    segments.push([`${year}-${startMonthDay}`, `${year}-${endMonthDay}`]);
  } else {
    segments.push([`${year}-${startMonthDay}`, `${year}-12-31`]);
    segments.push([`${year + 1}-01-01`, `${year + 1}-${endMonthDay}`]);
  }

  const byMD = new Map<string, { max: number | null; min: number | null }>();
  const forecastMD = new Set<string>();
  // 预报接口仅覆盖约未来 15 天（实测 ≥16 天返回 HTTP 400），超出部分无数据
  const HORIZON_DAYS = 15;
  const tomorrow = new Date(`${todayStr}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatDate(tomorrow);
  const horizon = new Date(`${todayStr}T00:00:00`);
  horizon.setDate(horizon.getDate() + HORIZON_DAYS);
  const horizonStr = formatDate(horizon);

  let truncated = false;

  for (const [segStart, segEnd] of segments) {
    // 历史段：<= 今天，使用 archive 接口（含完整历史）
    const pastEnd = segEnd < todayStr ? segEnd : todayStr;
    if (segStart <= pastEnd) {
      const resp = await fetchHistoricalWeather(city, segStart, pastEnd);
      resp.daily.time.forEach((t, i) => {
        byMD.set(mdOf(t), {
          max: resp.daily.temperature_2m_max[i],
          min: resp.daily.temperature_2m_min[i],
        });
      });
    }
    // 未来段：> 今天，使用 forecast 接口。
    // 将请求结束日收敛到 horizon 内（必成功），超出 horizon 的日期无数据(null)；
    // 即便接口仍报错（限流等），也只跳过未来段、保留已取到的历史段，避免整年数据丢失。
    const futStart = segStart > tomorrowStr ? segStart : tomorrowStr;
    const futEnd = segEnd < horizonStr ? segEnd : horizonStr;
    if (futStart <= futEnd) {
      try {
        const resp = await fetchForecastWeather(city, futStart, futEnd);
        resp.daily.time.forEach((t, i) => {
          byMD.set(mdOf(t), {
            max: resp.daily.temperature_2m_max[i],
            min: resp.daily.temperature_2m_min[i],
          });
          forecastMD.add(mdOf(t));
        });
      } catch {
        // 预报接口失败：保留历史段，未来段置为 null
      }
    }
    if (segEnd > horizonStr) truncated = true;
  }

  const labels = buildMonthDayLabels(startMonthDay, endMonthDay);
  const maxTemps = labels.map((md) => (byMD.has(md) ? byMD.get(md)!.max : null));
  const minTemps = labels.map((md) => (byMD.has(md) ? byMD.get(md)!.min : null));
  const forecastFlags = labels.map((md) => forecastMD.has(md));

  return { year, dates: labels, maxTemps, minTemps, forecastFlags, truncated };
}

// Query handler
async function handleQuery() {
  if (state.selectedYears.length === 0) {
    alert('请至少选择一个年份');
    return;
  }
  if (!state.startMonthDay || !state.endMonthDay) {
    alert('请选择日期范围');
    return;
  }

  state.loading = true;
  loadingEl.style.display = 'block';
  hideMessage();
  chartSection.style.display = 'none';
  tableSection.style.display = 'none';
  state.yearlyData = [];

  const todayStr = formatDate(new Date());

  const promises = state.selectedYears.map(async (year) => {
    try {
      return await fetchYearData(state.city, year, state.startMonthDay, state.endMonthDay, todayStr);
    } catch (error) {
      return {
        year,
        dates: [],
        maxTemps: [],
        minTemps: [],
        forecastFlags: [],
        error: error instanceof Error ? error.message : '请求失败',
      } as YearlyData;
    }
  });

  const results = await Promise.all(promises);
  state.yearlyData = results.filter((r) => !r.error);
  const errors = results.filter((r) => r.error);
  const truncatedYears = results.filter((r) => r.truncated && !r.error).map((r) => r.year);

  state.loading = false;
  loadingEl.style.display = 'none';

  if (state.yearlyData.length > 0) {
    chartSection.style.display = 'block';
    tableSection.style.display = 'block';
    currentLabels = buildMonthDayLabels(state.startMonthDay, state.endMonthDay);

    const yearAvgTemps = state.yearlyData.map((r) => {
      const validMax = r.maxTemps.filter((t): t is number => t !== null);
      const avgMax = validMax.length > 0 ? validMax.reduce((a, b) => a + b, 0) / validMax.length : 0;
      return { year: r.year, avgTemp: avgMax };
    });
    currentYearColors = assignColorsByAverageTemp(yearAvgTemps);

    chart.update(state.yearlyData, state.tempType, currentYearColors, state.city.name, currentLabels);
    dataTable.update(state.yearlyData, currentLabels);
  } else {
    chartSection.style.display = 'none';
    tableSection.style.display = 'none';
  }

  if (errors.length > 0) {
    const errorMsg = errors.map((e) => `${e.year}年：${e.error}`).join('；');
    showMessage(`以下年份数据获取失败：${errorMsg}`, 'error');
  } else if (truncatedYears.length > 0) {
    showMessage(
      `提示：${truncatedYears.join('、')}年 所请求的未来日期超出 Open-Meteo 预报上限（约 15 天），超出部分无数据、已按可获取范围部分显示。`,
      'info',
    );
  }
}

queryBtn.addEventListener('click', handleQuery);

// Initial query
handleQuery();

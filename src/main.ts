import './style.css';
import type { City, AppState, TempType, YearlyData } from './types';
import { CascaderCitySearch } from './components/CascaderCitySearch';
import { DateRangePicker } from './components/DateRangePicker';
import { YearSelector } from './components/YearSelector';
import { TempChart } from './components/TempChart';
import { DataTable } from './components/DataTable';
import { fetchHistoricalWeather, fetchForecastWeather, reverseGeocode, searchCities } from './api/open-meteo';
import { formatDate, buildMonthDayLabels, isWrappingRange, assignColorsByAverageTemp, getDefaultDateRange, getRecentYears } from './utils/helpers';
import { detectHeatwaves, detectColdWaves } from './logic/extremes';
import { buildYearAverages, buildYearSummaryStats, multiYearDailyAverage } from './logic/stats';
import { StatsCards } from './components/StatsCards';
import { ExtremeCards } from './components/ExtremeCards';

const FALLBACK_CITY: City = {
  name: '大连',
  latitude: 38.92,
  longitude: 121.62,
};

let defaultCity: City = FALLBACK_CITY;

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
let currentCityName = defaultCity.name;
let activeQueryController: AbortController | null = null;
let querySequence = 0;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '';

// Header
const header = document.createElement('header');
header.className = 'app-header';
const title = document.createElement('h1');
title.textContent = '中国城市历年气温对比';
header.appendChild(title);
app.appendChild(header);

// 主题切换按钮：三态循环 light → dark → auto（跟随系统）→ light
type ThemeMode = 'light' | 'dark' | 'auto';
const themeToggle = document.createElement('button');
themeToggle.type = 'button';
themeToggle.className = 'theme-toggle';
themeToggle.title = '切换主题';
themeToggle.setAttribute('aria-label', '切换主题');
// 主题图标：light=☀ / dark=☾ / auto=半阴半阳（用 ⚘ 不够直观，用文字标识）
const THEME_ICON: Record<ThemeMode, string> = { light: '☀', dark: '☾', auto: '◐' };
const THEME_LABEL: Record<ThemeMode, string> = { light: '浅色', dark: '深色', auto: '跟随系统' };

function applyTheme(mode: ThemeMode): void {
  if (mode === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', mode);
  }
  localStorage.setItem('theme', mode);
  themeToggle.innerHTML = `<span class="icon-theme">${THEME_ICON[mode]}</span><span class="label-theme">${THEME_LABEL[mode]}</span>`;
  themeToggle.title = `当前：${THEME_LABEL[mode]}（点击切换）`;
  // 通知图表重绘（读取新 CSS 变量值）
  onThemeChange();
}

// 占位：chart 定义后赋值，用于主题切换时重绘图表读取新 CSS 变量
let onThemeChange: () => void = () => {};

// 读取持久化的主题模式，默认 auto
const savedTheme = (localStorage.getItem('theme') as ThemeMode | null) ?? 'auto';
applyTheme(savedTheme);

themeToggle.addEventListener('click', () => {
  const current = (localStorage.getItem('theme') as ThemeMode) ?? 'auto';
  const next: ThemeMode = current === 'light' ? 'dark' : current === 'dark' ? 'auto' : 'light';
  applyTheme(next);
});
app.appendChild(themeToggle);

// Controls
const controls = document.createElement('section');
controls.className = 'controls';
let citySelectedByUser = false;

const citySearch = CascaderCitySearch({
  onSelect: (city) => {
    citySelectedByUser = true;
    state.city = city;
  },
  defaultCity,
});

// 尝试获取当前地理位置；成功后将默认城市切换为"当前位置"
function initGeolocation() {
  if (!('geolocation' in navigator)) return;
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      if (citySelectedByUser) return;
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
        defaultCity = normalizedCity;
        state.city = normalizedCity;
        void handleQuery();
      } catch {
        const currentCity: City = {
          name: '当前位置',
          latitude: lat,
          longitude: lng,
        };
        const normalizedCity = citySearch.update(currentCity);
        defaultCity = normalizedCity;
        state.city = normalizedCity;
        void handleQuery();
      }
    },
    () => {
      // 获取失败时保持默认城市（大连）
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
  );
}

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

const DEFAULT_YEARS = getRecentYears(5, false);
const DEFAULT_RANGE = getDefaultDateRange();
const DEFAULT_START_MD = DEFAULT_RANGE.start.slice(5);
const DEFAULT_END_MD = DEFAULT_RANGE.end.slice(5);
const DEFAULT_TEMP_TYPE: TempType = 'max';

const queryBtn = document.createElement('button');
queryBtn.type = 'button';
queryBtn.textContent = '查询';
queryBtn.className = 'query-btn';

controls.appendChild(citySearch.element);
controls.appendChild(dateRangePicker.element);
controls.appendChild(yearSelector.element);
controls.appendChild(queryBtn);
app.appendChild(controls);

// 先应用 URL 参数；若 URL 已指定城市，则不再请求当前位置
const hasUrlCity = await applyUrlParams();
if (!hasUrlCity) {
  initGeolocation();
}

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
    const avgLine = multiYearDailyAverage(state.yearlyData, currentLabels, state.tempType);
    const heatwaves = detectHeatwaves(state.yearlyData, currentLabels);
    const coldWaves = detectColdWaves(state.yearlyData, currentLabels);
    const summaries = buildYearSummaryStats(state.yearlyData, state.tempType, heatwaves, coldWaves);
    const yearAverages = buildYearAverages(state.yearlyData, state.tempType);
    chart.update(state.yearlyData, state.tempType, currentYearColors, currentCityName, currentLabels, avgLine, yearAverages);
    statsCards.update(summaries, state.tempType, currentYearColors);
    extremeCards.update(heatwaves, coldWaves, currentYearColors);
  }
}

maxTab.addEventListener('click', () => setTempType('max'));
minTab.addEventListener('click', () => setTempType('min'));

tabContainer.appendChild(maxTab);
tabContainer.appendChild(minTab);
chartSection.appendChild(tabContainer);

const chartContainer = document.createElement('div');
chartContainer.className = 'chart-container';
// 图表骨架屏：绝对定位铺满 chart-container，加载时遮挡空白画布；数据返回后隐藏
const chartSkeleton = document.createElement('div');
chartSkeleton.className = 'skeleton skeleton-chart';
chartContainer.appendChild(chartSkeleton);
chartSection.appendChild(chartContainer);
app.appendChild(chartSection);

const chart = TempChart({ container: chartContainer });

// Stats section
const statsSection = document.createElement('section');
statsSection.className = 'stats-container';
app.appendChild(statsSection);
// 骨架屏：8 张占位卡片，与 StatsCards 实际卡片数量一致
const statsSkeleton = document.createElement('div');
statsSkeleton.className = 'skeleton skeleton-table skeleton-table--stats';
statsSection.appendChild(statsSkeleton);
// 真实内容容器：加载时 display:none 隐藏旧值，加载完成后显示
const statsContent = document.createElement('div');
statsContent.className = 'stats-content';
statsContent.style.display = 'none';
statsSection.appendChild(statsContent);
const statsCards = StatsCards({ container: statsContent });

// Extreme events section (置于「详细数据」上方)
const extremeSection = document.createElement('section');
extremeSection.className = 'extreme-container';
app.appendChild(extremeSection);
// 骨架屏：2 张占位卡片
const extremeSkeleton = document.createElement('div');
extremeSkeleton.className = 'skeleton-row';
for (let i = 0; i < 2; i++) {
  const c = document.createElement('div');
  c.className = 'skeleton skeleton-card';
  extremeSkeleton.appendChild(c);
}
extremeSection.appendChild(extremeSkeleton);
// 真实内容容器
const extremeContent = document.createElement('div');
extremeContent.className = 'extreme-content';
extremeContent.style.display = 'none';
extremeSection.appendChild(extremeContent);
const extremeCards = ExtremeCards({ container: extremeContent });

// Table section
const tableSection = document.createElement('section');
tableSection.className = 'table-section';
const tableTitle = document.createElement('h2');
tableTitle.textContent = '详细数据';
tableSection.appendChild(tableTitle);
// 表格骨架屏
const tableSkeleton = document.createElement('div');
tableSkeleton.className = 'skeleton skeleton-table';
tableSection.appendChild(tableSkeleton);
// 真实内容容器
const tableContent = document.createElement('div');
tableContent.className = 'table-content';
tableContent.style.display = 'none';
tableSection.appendChild(tableContent);
app.appendChild(tableSection);

const dataTable = DataTable({ container: tableContent });

// 主题切换时重绘图表/卡片（读取新 CSS 变量值，使硬编码颜色跟随主题）
onThemeChange = () => {
  if (state.yearlyData.length > 0) {
    setTempType(state.tempType);
  }
};
// auto 模式下系统主题变化时也重绘
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if ((localStorage.getItem('theme') as ThemeMode | null) ?? 'auto' === 'auto') {
    onThemeChange();
  }
});

// Footer
const footer = document.createElement('footer');
footer.className = 'app-footer';
footer.innerHTML = '<p>数据来源: <a href="https://open-meteo.com/" target="_blank">Open-Meteo</a></p>';
app.appendChild(footer);

// 错误/提示横幅
const messageEl = document.createElement('div');
messageEl.className = 'message-banner';
messageEl.style.display = 'none';
controls.insertAdjacentElement('afterend', messageEl);

function showMessage(text: string, type: 'error' | 'info' = 'error') {
  messageEl.textContent = text;
  messageEl.className = `message-banner message-${type}`;
  messageEl.style.display = 'block';
}

function hideMessage() {
  messageEl.style.display = 'none';
}

// ===== URL 路由：读写查询条件，分享链接可复现 =====
function parseCityFromParam(value: string, params: URLSearchParams): City | null {
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

async function applyUrlParams(): Promise<boolean> {
  const params = new URLSearchParams(location.search);
  let hasValidCity = false;

  const cityParam = params.get('city');
  if (cityParam) {
    let parsed = parseCityFromParam(cityParam, params);
    if (!parsed) {
      try {
        const response = await searchCities(cityParam);
        const result = response.results?.[0];
        if (result) parsed = { name: cityParam, latitude: result.latitude, longitude: result.longitude };
      } catch {
        // 旧链接解析失败时保持默认城市，并允许浏览器定位接管。
      }
    }
    if (parsed) {
      hasValidCity = true;
      defaultCity = parsed;
      state.city = parsed;
      const normalizedCity = citySearch.update(parsed);
      defaultCity = normalizedCity;
      state.city = normalizedCity;
    }
  }

  const startParam = params.get('start');
  const endParam = params.get('end');
  const monthDayPattern = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  const isValidMonthDay = (value: string) => monthDayPattern.test(value)
    && formatDate(new Date(`2000-${value}T00:00:00`)).slice(5) === value;
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

  // 主题模式只通过 localStorage 持久化，不属于查询条件，不从 URL 读取
  return hasValidCity;
}

function updateUrlFromState(query: { city: City; startMonthDay: string; endMonthDay: string; selectedYears: number[] }): void {
  const params = new URLSearchParams();

  const isFallbackCity = query.city.name === FALLBACK_CITY.name
    && query.city.latitude === FALLBACK_CITY.latitude
    && query.city.longitude === FALLBACK_CITY.longitude;
  if (!isFallbackCity) {
    params.set('city', query.city.name);
    params.set('lat', query.city.latitude.toFixed(4));
    params.set('lng', query.city.longitude.toFixed(4));
  }

  if (query.startMonthDay && query.endMonthDay) {
    if (query.startMonthDay !== DEFAULT_START_MD || query.endMonthDay !== DEFAULT_END_MD) {
      params.set('start', query.startMonthDay);
      params.set('end', query.endMonthDay);
    }
  }

  const yearsStr = query.selectedYears.join(',');
  const defaultYearsStr = DEFAULT_YEARS.join(',');
  if (yearsStr && yearsStr !== defaultYearsStr) {
    params.set('years', yearsStr);
  }

  if (state.tempType !== DEFAULT_TEMP_TYPE) {
    params.set('type', state.tempType);
  }

  // 主题模式通过 localStorage 持久化，不属于查询条件，不写入 URL

  const queryString = params.toString();
  const newUrl = queryString ? `${location.pathname}?${queryString}` : location.pathname;
  window.history.replaceState({}, '', newUrl);
}

// 加载骨架屏控制：显示骨架 + 隐藏旧内容；隐藏骨架 + 显示新内容。
// 设计目的：避免"display:none 隐藏整个区域"导致的页面高度跳变，骨架与真实内容高度相近，加载时占位、数据回填后无缝切换。
function showSkeletons() {
  chartSkeleton.style.display = 'block';
  statsSkeleton.style.display = 'block';
  extremeSkeleton.style.display = 'flex';
  tableSkeleton.style.display = 'block';
  statsContent.style.display = 'none';
  extremeContent.style.display = 'none';
  tableContent.style.display = 'none';
}
function hideSkeletons() {
  chartSkeleton.style.display = 'none';
  statsSkeleton.style.display = 'none';
  extremeSkeleton.style.display = 'none';
  tableSkeleton.style.display = 'none';
  statsContent.style.display = 'block';
  extremeContent.style.display = 'block';
  tableContent.style.display = 'block';
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
  signal: AbortSignal,
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
  let forecastError = false;

  for (const [segStart, segEnd] of segments) {
    // 历史段：<= 今天，使用 archive 接口（含完整历史）
    const pastEnd = segEnd < todayStr ? segEnd : todayStr;
    if (segStart <= pastEnd) {
      const resp = await fetchHistoricalWeather(city, segStart, pastEnd, signal);
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
        const resp = await fetchForecastWeather(city, futStart, futEnd, signal);
        resp.daily.time.forEach((t, i) => {
          byMD.set(mdOf(t), {
            max: resp.daily.temperature_2m_max[i],
            min: resp.daily.temperature_2m_min[i],
          });
          forecastMD.add(mdOf(t));
        });
      } catch (error) {
        if (signal.aborted) throw error;
        forecastError = true;
      }
    }
    if (segEnd > horizonStr) truncated = true;
  }

  const labels = buildMonthDayLabels(startMonthDay, endMonthDay);
  const maxTemps = labels.map((md) => (byMD.has(md) ? byMD.get(md)!.max : null));
  const minTemps = labels.map((md) => (byMD.has(md) ? byMD.get(md)!.min : null));
  const forecastFlags = labels.map((md) => forecastMD.has(md));

  return { year, dates: labels, maxTemps, minTemps, forecastFlags, truncated, forecastError };
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

  activeQueryController?.abort();
  const controller = new AbortController();
  activeQueryController = controller;
  const sequence = ++querySequence;
  const query = {
    city: { ...state.city },
    startMonthDay: state.startMonthDay,
    endMonthDay: state.endMonthDay,
    selectedYears: [...state.selectedYears],
  };

  state.loading = true;
  queryBtn.disabled = true;
  queryBtn.setAttribute('aria-busy', 'true');
  hideMessage();
  showSkeletons();

  const todayStr = formatDate(new Date());

  const promises = query.selectedYears.map(async (year) => {
    try {
      return await fetchYearData(query.city, year, query.startMonthDay, query.endMonthDay, todayStr, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw error;
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

  let results: YearlyData[];
  try {
    results = await Promise.all(promises);
  } catch (error) {
    if (controller.signal.aborted) return;
    throw error;
  }
  if (sequence !== querySequence) return;

  state.yearlyData = results.filter((r) => !r.error);
  const errors = results.filter((r) => r.error);
  const truncatedYears = results.filter((r) => r.truncated && !r.error).map((r) => r.year);
  const forecastErrorYears = results.filter((r) => r.forecastError && !r.error).map((r) => r.year);

  state.loading = false;
  queryBtn.disabled = false;
  queryBtn.removeAttribute('aria-busy');
  activeQueryController = null;
  const hasData = state.yearlyData.length > 0;

  if (hasData) {
    chartSection.style.display = '';
    tableSection.style.display = '';
    statsSection.style.display = '';
    extremeSection.style.display = '';
    currentLabels = buildMonthDayLabels(query.startMonthDay, query.endMonthDay);
    currentCityName = query.city.name;

    const yearAvgTemps = state.yearlyData.map((r) => {
      const validMax = r.maxTemps.filter((t): t is number => t !== null);
      const avgMax = validMax.length > 0 ? validMax.reduce((a, b) => a + b, 0) / validMax.length : 0;
      return { year: r.year, avgTemp: avgMax };
    });
    currentYearColors = assignColorsByAverageTemp(yearAvgTemps);

    const heatwaves = detectHeatwaves(state.yearlyData, currentLabels);
    const coldWaves = detectColdWaves(state.yearlyData, currentLabels);
    const avgLine = multiYearDailyAverage(state.yearlyData, currentLabels, state.tempType);
    const summaries = buildYearSummaryStats(state.yearlyData, state.tempType, heatwaves, coldWaves);
    const yearAverages = buildYearAverages(state.yearlyData, state.tempType);

    chart.update(state.yearlyData, state.tempType, currentYearColors, query.city.name, currentLabels, avgLine, yearAverages);
    dataTable.update(state.yearlyData, currentLabels);
    statsCards.update(summaries, state.tempType, currentYearColors);
    extremeCards.update(heatwaves, coldWaves, currentYearColors);
  }

  // 关键顺序：先调用所有 update() 把新内容渲染进仍 display:none 的内容容器，
  // 再 hideSkeletons() 一次性隐藏骨架 + 显示新内容 -> 避免旧内容闪现
  hideSkeletons();

  // 查询成功后把非默认条件写入 URL，方便分享
  if (hasData) {
    updateUrlFromState(query);
  }

  if (!hasData) {
    chartSection.style.display = 'none';
    tableSection.style.display = 'none';
    statsSection.style.display = 'none';
    extremeSection.style.display = 'none';
  }

  if (errors.length > 0 || forecastErrorYears.length > 0) {
    const messages: string[] = [];
    if (errors.length > 0) messages.push(`数据获取失败：${errors.map((e) => `${e.year}年（${e.error}）`).join('；')}`);
    if (forecastErrorYears.length > 0) messages.push(`${forecastErrorYears.join('、')}年的预报获取失败，已保留历史数据`);
    showMessage(messages.join('。'), 'error');
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

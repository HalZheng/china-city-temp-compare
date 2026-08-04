import './style.css';
import type { City, AppState, TempType } from './types';
import { CascaderCitySearch } from './components/CascaderCitySearch';
import { DateRangePicker } from './components/DateRangePicker';
import { YearSelector } from './components/YearSelector';
import { TempChart } from './components/TempChart';
import { DataTable } from './components/DataTable';
import { StatsCards } from './components/StatsCards';
import { ExtremeCards } from './components/ExtremeCards';
import { getDefaultDateRange, getRecentYears } from './utils/helpers';
import { createThemeToggle } from './theme';
import { createMessageBanner } from './message';
import { createSkeletons } from './skeleton';
import { applyUrlParams } from './router';
import { initGeolocation } from './geolocation';
import { createRenderAll, type RenderRuntime } from './render';
import { createQueryHandler } from './query';

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

// runtime：跨模块共享的可变状态（图表标签/颜色/城市名/极端事件缓存）。
// query.ts 在数据变化后写入，render.ts 读取用于渲染。
const runtime: RenderRuntime = {
  currentYearColors: {},
  currentLabels: [],
  currentCityName: defaultCity.name,
  cachedHeatwaves: [],
  cachedColdWaves: [],
};

// ===== App shell =====
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '';

const header = document.createElement('header');
header.className = 'app-header';
const title = document.createElement('h1');
title.textContent = '中国城市历年气温对比';
header.appendChild(title);
app.appendChild(header);

// 主题切换：onThemeChange 回调在 renderAll 创建后重设（初次 applyTheme 时 triggerRerender 还是空函数，无副作用）
let triggerRerender: () => void = () => {};
const themeToggle = createThemeToggle(() => triggerRerender());
app.appendChild(themeToggle.element);

// ===== Controls =====
const controls = document.createElement('section');
controls.className = 'controls';
let citySelectedByUser = false;

// citySearch 的 onSelect 需要 handleQuery，但 handleQuery 在 queryHandler 创建后才有。
// 用 lazy 引用解决循环依赖：先占位，queryHandler 创建后赋值。
let handleQuery: () => Promise<void> = async () => {};

const citySearch = CascaderCitySearch({
  onSelect: (city) => {
    citySelectedByUser = true;
    state.city = city;
    // 任务 5：城市选后自动查询（与定位成功行为一致）
    void handleQuery();
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

const DEFAULT_YEARS = getRecentYears(5, false);
const DEFAULT_RANGE = getDefaultDateRange();
const DEFAULT_START_MD = DEFAULT_RANGE.start.slice(5);
const DEFAULT_END_MD = DEFAULT_RANGE.end.slice(5);

const queryBtn = document.createElement('button');
queryBtn.type = 'button';
queryBtn.textContent = '查询';
queryBtn.className = 'query-btn';

controls.appendChild(citySearch.element);
controls.appendChild(dateRangePicker.element);
controls.appendChild(yearSelector.element);
controls.appendChild(queryBtn);
app.appendChild(controls);

// ===== Message banner =====
const messageBanner = createMessageBanner();
controls.insertAdjacentElement('afterend', messageBanner.element);

// ===== Skeletons + sections =====
const skeleton = createSkeletons();

// Chart section: tab + chart-container（含骨架屏）
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
tabContainer.appendChild(maxTab);
tabContainer.appendChild(minTab);
chartSection.appendChild(tabContainer);

const chartContainer = document.createElement('div');
chartContainer.className = 'chart-container';
chartContainer.appendChild(skeleton.chartSkeleton);
chartSection.appendChild(chartContainer);
app.appendChild(chartSection);

// Stats section
const statsSection = document.createElement('section');
statsSection.className = 'stats-container';
statsSection.appendChild(skeleton.statsSkeleton);
statsSection.appendChild(skeleton.statsContent);
app.appendChild(statsSection);

// Extreme section
const extremeSection = document.createElement('section');
extremeSection.className = 'extreme-container';
extremeSection.appendChild(skeleton.extremeSkeleton);
extremeSection.appendChild(skeleton.extremeContent);
app.appendChild(extremeSection);

// Table section
const tableSection = document.createElement('section');
tableSection.className = 'table-section';
const tableTitle = document.createElement('h2');
tableTitle.textContent = '详细数据';
tableSection.appendChild(tableTitle);
tableSection.appendChild(skeleton.tableSkeleton);
tableSection.appendChild(skeleton.tableContent);
app.appendChild(tableSection);

// ===== Components =====
const chart = TempChart({ container: chartContainer });
const dataTable = DataTable({ container: skeleton.tableContent });
const statsCards = StatsCards({ container: skeleton.statsContent });
const extremeCards = ExtremeCards({ container: skeleton.extremeContent });

// ===== Render + Query =====
const renderAll = createRenderAll({
  state,
  components: { chart, dataTable, statsCards, extremeCards },
  runtime,
});

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
    // 表格同时显示 max/min，切 tempType 无需重渲染表格
    renderAll({ skipTable: true });
  }
}

// 主题切换时重绘图表/卡片（读取新 CSS 变量值，使硬编码颜色跟随主题）
triggerRerender = () => {
  if (state.yearlyData.length > 0) {
    setTempType(state.tempType);
  }
};

const queryHandler = createQueryHandler({
  state,
  skeleton,
  message: messageBanner,
  renderAll,
  runtime,
  defaults: {
    startMonthDay: DEFAULT_START_MD,
    endMonthDay: DEFAULT_END_MD,
    years: DEFAULT_YEARS,
    fallbackCity: FALLBACK_CITY,
  },
  queryBtn,
  sections: { chart: chartSection, stats: statsSection, extreme: extremeSection, table: tableSection },
});
handleQuery = queryHandler.handleQuery;

maxTab.addEventListener('click', () => setTempType('max'));
minTab.addEventListener('click', () => setTempType('min'));
queryBtn.addEventListener('click', () => void handleQuery());

// ===== URL 路由 + 定位 + 初始查询 =====
const urlResult = await applyUrlParams({
  state,
  citySearch,
  dateRangePicker,
  yearSelector,
  setTempType,
  defaults: {
    startMonthDay: DEFAULT_START_MD,
    endMonthDay: DEFAULT_END_MD,
    years: DEFAULT_YEARS,
    fallbackCity: FALLBACK_CITY,
  },
});
if (urlResult.resolvedCity) defaultCity = urlResult.resolvedCity;
if (!urlResult.hasValidCity) {
  initGeolocation({
    state,
    citySearch,
    handleQuery: () => void handleQuery(),
    isCitySelectedByUser: () => citySelectedByUser,
    onCityResolved: (city) => {
      defaultCity = city;
    },
  });
}

// Initial query
void handleQuery();

// ===== Footer =====
const footer = document.createElement('footer');
footer.className = 'app-footer';
footer.innerHTML = '<p>数据来源: <a href="https://open-meteo.com/" target="_blank">Open-Meteo</a></p>';
app.appendChild(footer);

// ===== 回到顶部按钮 =====
const backToTopBtn = document.createElement('button');
backToTopBtn.type = 'button';
backToTopBtn.className = 'back-to-top-btn';
backToTopBtn.title = '回到顶部';
backToTopBtn.setAttribute('aria-label', '回到顶部');
backToTopBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
document.body.appendChild(backToTopBtn);

backToTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

window.addEventListener('scroll', () => {
  backToTopBtn.classList.toggle('visible', window.scrollY > window.innerHeight * 0.5);
}, { passive: true });

// ===== 页面卸载时清理资源 =====
window.addEventListener('beforeunload', () => {
  chart.destroy();
  citySearch.destroy();
});

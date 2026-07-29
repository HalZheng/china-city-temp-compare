import './style.css';
import type { City, AppState, TempType, YearlyData } from './types';
import { CitySearch } from './components/CitySearch';
import { DateRangePicker } from './components/DateRangePicker';
import { YearSelector } from './components/YearSelector';
import { TempChart } from './components/TempChart';
import { DataTable } from './components/DataTable';
import { fetchHistoricalWeather, fetchForecastWeather } from './api/open-meteo';
import { buildDateForYear, formatDate, filterDateRange, assignColorsByAverageTemp } from './utils/helpers';

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
    chart.update(state.yearlyData, state.tempType, currentYearColors, state.city.name);
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
  chartSection.style.display = 'none';
  tableSection.style.display = 'none';
  state.yearlyData = [];

  const todayStr = formatDate(new Date());
  const currentYear = new Date().getFullYear();

  const promises = state.selectedYears.map(async (year) => {
    const startDate = buildDateForYear(state.startMonthDay, year);
    const endDate = buildDateForYear(state.endMonthDay, year);
    try {
      let response;
      let forecastIndices: Set<number> | undefined;
      if (year === currentYear && endDate > todayStr) {
        const raw = await fetchForecastWeather(state.city, startDate, endDate);
        response = filterDateRange(raw, startDate, endDate);
        forecastIndices = new Set<number>();
        response.daily.time.forEach((t, i) => {
          if (t > todayStr) {
            forecastIndices!.add(i);
          }
        });
      } else {
        response = await fetchHistoricalWeather(state.city, startDate, endDate);
      }
      return {
        year,
        dates: response.daily.time,
        maxTemps: response.daily.temperature_2m_max,
        minTemps: response.daily.temperature_2m_min,
        forecastIndices,
      } as YearlyData;
    } catch (error) {
      if (year === currentYear) {
        console.warn(`${year}年数据获取失败，将显示为空折线:`, error);
        return {
          year,
          dates: [],
          maxTemps: [],
          minTemps: [],
        } as YearlyData;
      }
      return {
        year,
        dates: [],
        maxTemps: [],
        minTemps: [],
        error: error instanceof Error ? error.message : '请求失败',
      } as YearlyData;
    }
  });

  const results = await Promise.all(promises);
  state.yearlyData = results.filter((r) => !r.error);
  const errors = results.filter((r) => r.error);

  state.loading = false;
  loadingEl.style.display = 'none';

  if (state.yearlyData.length > 0) {
    chartSection.style.display = 'block';
    tableSection.style.display = 'block';

    const yearAvgTemps = state.yearlyData.map((r) => {
      const validMax = r.maxTemps.filter((t): t is number => t !== null);
      const avgMax = validMax.length > 0 ? validMax.reduce((a, b) => a + b, 0) / validMax.length : 0;
      return { year: r.year, avgTemp: avgMax };
    });
    currentYearColors = assignColorsByAverageTemp(yearAvgTemps);

    chart.update(state.yearlyData, state.tempType, currentYearColors, state.city.name);
    dataTable.update(state.yearlyData);
  }

  if (errors.length > 0) {
    const errorMsg = errors.map((e) => `${e.year}年: ${e.error}`).join('\n');
    console.error(errorMsg);
  }
}

queryBtn.addEventListener('click', handleQuery);

// Initial query
handleQuery();

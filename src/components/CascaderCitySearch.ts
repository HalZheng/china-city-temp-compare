import { searchCities } from '../api/open-meteo';
import type { City, GeocodingResult } from '../types';
import { pinyin } from 'pinyin-pro';
import pcaData from 'china-division/dist/pca.json';

// Shoelace 组件（按需注册）
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';

export interface CascaderCitySearchProps {
  onSelect: (city: City) => void;
  defaultCity: City;
}

export interface CascaderCitySearchInstance {
  element: HTMLElement;
  update: (city: City) => City;
}

/** pca.json 结构：省 -> 市 -> 区县列表 */
type PcaData = Record<string, Record<string, string[]>>;

const pca = pcaData as unknown as PcaData;

/** 扁平索引项 */
interface FlatEntry {
  district: string;
  city: string;
  province: string;
  names: [string, string, string];
  pys: [string, string, string];
  inits: [string, string, string];
}

const SEARCH_LIMIT = 60;

// ---------------- 拼音工具 ----------------
function fullPinyin(s: string): string {
  return pinyin(s, { toneType: 'none' }).replace(/\s+/g, '').toLowerCase();
}
function initials(s: string): string {
  return pinyin(s, { pattern: 'first', toneType: 'none' }).replace(/\s+/g, '').toLowerCase();
}

// ---------------- 一次性扁平索引（懒加载、缓存） ----------------
let flatIndex: FlatEntry[] | null = null;
function getFlatIndex(): FlatEntry[] {
  if (flatIndex) return flatIndex;
  const entries: FlatEntry[] = [];
  for (const province of Object.keys(pca)) {
    const pyProv = fullPinyin(province);
    const initProv = initials(province);
    const cities = pca[province];
    for (const city of Object.keys(cities)) {
      const pyCity = fullPinyin(city);
      const initCity = initials(city);
      for (const district of cities[city]) {
        entries.push({
          district,
          city,
          province,
          names: [district, city, province],
          pys: [fullPinyin(district), pyCity, pyProv],
          inits: [initials(district), initCity, initProv],
        });
      }
    }
  }
  flatIndex = entries;
  return entries;
}

function searchEntries(query: string): FlatEntry[] {
  const q = query.trim();
  if (!q) return [];
  const qLower = q.toLowerCase();
  const out: FlatEntry[] = [];
  for (const e of getFlatIndex()) {
    let matched = false;
    for (let i = 0; i < 3; i++) {
      if (e.names[i].includes(q) || e.pys[i].includes(qLower) || e.inits[i].includes(qLower)) {
        matched = true;
        break;
      }
    }
    if (matched) {
      out.push(e);
      if (out.length >= SEARCH_LIMIT) break;
    }
  }
  return out;
}

// ---------------- 坐标解析 ----------------
function stripAdminSuffix(s: string): string {
  return s.replace(/(省|市|自治区|壮族自治区|维吾尔自治区|回族自治区|特别行政区)$/, '');
}

function normalizedAdminName(name: string): string {
  return stripAdminSuffix(name.replace(/(区|县|自治州|地区|盟)$/, ''));
}

function sameAdminName(left: string, right: string): boolean {
  const normalizedLeft = normalizedAdminName(left);
  const normalizedRight = normalizedAdminName(right);
  return normalizedLeft === normalizedRight || fullPinyin(normalizedLeft) === fullPinyin(normalizedRight);
}

function pickByProvince(results: GeocodingResult[], province: string): GeocodingResult | undefined {
  const target = stripAdminSuffix(province);
  return results.find(
    (r) => !!r.admin1 && (r.admin1 === province || stripAdminSuffix(r.admin1) === target),
  );
}

async function resolveCoordinates(entry: FlatEntry): Promise<GeocodingResult | null> {
  let resp = await searchCities(entry.district);
  let results = resp.results ?? [];
  let picked = pickByProvince(results, entry.province) ?? results[0];

  if (!picked) {
    resp = await searchCities(`${entry.district}${entry.city}`);
    results = resp.results ?? [];
    picked = pickByProvince(results, entry.province) ?? results[0];
  }

  if (!picked) {
    resp = await searchCities(entry.city);
    results = resp.results ?? [];
    picked = results[0];
  }
  return picked ?? null;
}

// ---------------- 样式 ----------------
let styleInjected = false;
function injectStyles(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.id = 'cascader-city-search-style';
  style.textContent = `
.city-search {
  position: relative;
  z-index: 1000;
  isolation: isolate;
  --sl-z-index-dropdown: 1100;
}

/* Shoelace 变量映射到项目主题 */
.city-search sl-input,
.city-search sl-select {
  display: block;
  width: 100%;
  --sl-input-font-family: inherit;
  --sl-input-font-weight: 400;
  --sl-input-border-width: 1px;
  --sl-input-border-radius-medium: 8px;
  --sl-input-height-medium: 42px;
  --sl-input-font-size-medium: 15px;
  --sl-input-spacing-medium: 12px;
  --sl-input-background-color: var(--surface);
  --sl-input-background-color-hover: var(--surface);
  --sl-input-background-color-focus: var(--surface);
  --sl-input-background-color-disabled: var(--surface-2);
  --sl-input-border-color: var(--border);
  --sl-input-border-color-hover: var(--accent);
  --sl-input-border-color-focus: var(--accent);
  --sl-input-border-color-disabled: var(--border);
  --sl-input-color: var(--text);
  --sl-input-color-hover: var(--text);
  --sl-input-color-focus: var(--text-h);
  --sl-input-color-disabled: var(--text);
  --sl-input-placeholder-color: var(--icon);
  --sl-input-icon-color: var(--icon);
  --sl-input-focus-ring-color: var(--accent);
  --sl-focus-ring-width: 2px;
  --sl-color-neutral-700: var(--text);
}

.city-search__search { margin-bottom: 8px; }

.city-search__cascader {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.city-search__results {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  z-index: 1200;
  max-height: 320px;
  overflow-y: auto;
  padding: 4px;
}

.city-search__result {
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.city-search__result:hover,
.city-search__result.is-active { background: var(--accent-bg); }
.city-search__result-name { color: var(--text-h); font-size: 14px; }
.city-search__result-path { color: var(--icon); font-size: 12px; margin-top: 2px; }

.city-search__empty,
.city-search__loading {
  padding: 16px 12px;
  color: var(--icon);
  font-size: 13px;
  text-align: center;
}
.city-search__empty--error { color: var(--error); }

@media (max-width: 640px) {
  .city-search__cascader { grid-template-columns: 1fr; }
}
`;
  document.head.appendChild(style);
}

export function CascaderCitySearch({ onSelect, defaultCity }: CascaderCitySearchProps): CascaderCitySearchInstance {
  injectStyles();

  const container = document.createElement('div');
  container.className = 'city-search';

  // 搜索输入框
  const searchInput = document.createElement('sl-input');
  searchInput.className = 'city-search__search';
  searchInput.placeholder = '搜索城市/区县（支持拼音）';
  searchInput.value = defaultCity.name;
  searchInput.clearable = true;

  // 级联选择器
  const cascader = document.createElement('div');
  cascader.className = 'city-search__cascader';

  const provSelect = document.createElement('sl-select');
  provSelect.placeholder = '选择省份';

  const citySelect = document.createElement('sl-select');
  citySelect.placeholder = '选择城市';
  citySelect.disabled = true;

  const distSelect = document.createElement('sl-select');
  distSelect.placeholder = '选择区县';
  distSelect.disabled = true;

  cascader.append(provSelect, citySelect, distSelect);

  // 搜索结果浮层
  const resultsEl = document.createElement('div');
  resultsEl.className = 'city-search__results';
  resultsEl.style.display = 'none';

  container.append(searchInput, cascader, resultsEl);

  let inFlight = false;
  let selectedProvince = '';
  let selectedCity = '';

  // 初始化省份列表
  function renderProvinces(): void {
    provSelect.innerHTML = '';
    const placeholder = document.createElement('sl-option');
    placeholder.value = '';
    placeholder.textContent = '选择省份';
    placeholder.disabled = true;
    provSelect.appendChild(placeholder);

    for (const province of Object.keys(pca)) {
      const opt = document.createElement('sl-option');
      opt.value = province;
      opt.textContent = province;
      provSelect.appendChild(opt);
    }
    provSelect.value = selectedProvince || '';
  }

  function renderCities(): void {
    citySelect.innerHTML = '';
    citySelect.disabled = !selectedProvince;
    if (!selectedProvince) {
      citySelect.value = '';
      return;
    }
    const placeholder = document.createElement('sl-option');
    placeholder.value = '';
    placeholder.textContent = '选择城市';
    placeholder.disabled = true;
    citySelect.appendChild(placeholder);

    const cities = pca[selectedProvince];
    for (const city of Object.keys(cities)) {
      const opt = document.createElement('sl-option');
      opt.value = city;
      opt.textContent = city;
      citySelect.appendChild(opt);
    }
    citySelect.value = selectedCity || '';
  }

  function renderDistricts(): void {
    distSelect.innerHTML = '';
    distSelect.disabled = !selectedCity;
    if (!selectedCity) {
      distSelect.value = '';
      return;
    }
    const placeholder = document.createElement('sl-option');
    placeholder.value = '';
    placeholder.textContent = '选择区县';
    placeholder.disabled = true;
    distSelect.appendChild(placeholder);

    const districts = pca[selectedProvince][selectedCity];
    for (const district of districts) {
      const opt = document.createElement('sl-option');
      opt.value = district;
      opt.textContent = district;
      distSelect.appendChild(opt);
    }
  }



  async function selectEntry(entry: FlatEntry, suppressOnSelect = false): Promise<City | null> {
    if (inFlight) return null;
    inFlight = true;
    resultsEl.style.display = 'block';
    resultsEl.innerHTML = '<div class="city-search__loading"><sl-spinner></sl-spinner></div>';
    try {
      const picked = await resolveCoordinates(entry);
      if (!picked) {
        resultsEl.innerHTML = '<div class="city-search__empty city-search__empty--error">未找到该地区的坐标数据</div>';
        inFlight = false;
        return null;
      }
      searchInput.value = entry.district;
      resultsEl.style.display = 'none';
      selectedProvince = entry.province;
      selectedCity = entry.city;
      renderProvinces();
      renderCities();
      renderDistricts();
      distSelect.value = entry.district;
      const city: City = {
        name: entry.district,
        latitude: picked.latitude,
        longitude: picked.longitude,
        admin1: picked.admin1,
        country: picked.country,
      };
      if (!suppressOnSelect) onSelect(city);
      return city;
    } catch {
      resultsEl.innerHTML = '<div class="city-search__empty city-search__empty--error">获取坐标失败，请重试</div>';
      return null;
    } finally {
      inFlight = false;
    }
  }

  let currentResults: FlatEntry[] = [];
  let activeIndex = -1;

  function renderResults(query: string): void {
    resultsEl.innerHTML = '';
    currentResults = searchEntries(query);
    activeIndex = -1;
    if (currentResults.length === 0) {
      resultsEl.innerHTML = '<div class="city-search__empty">未找到匹配地区</div>';
      return;
    }
    currentResults.forEach((e, idx) => {
      const item = document.createElement('div');
      item.className = 'city-search__result';
      item.setAttribute('data-index', String(idx));
      item.innerHTML = `<span class="city-search__result-name">${e.district}</span><span class="city-search__result-path">${formatPath(e)}</span>`;
      item.addEventListener('click', () => void selectEntry(e));
      item.addEventListener('mouseenter', () => setActiveIndex(idx));
      resultsEl.appendChild(item);
    });
  }

  function setActiveIndex(idx: number): void {
    activeIndex = idx;
    const items = resultsEl.querySelectorAll('.city-search__result');
    items.forEach((el, i) => {
      el.classList.toggle('is-active', i === idx);
    });
  }

  function moveActive(delta: number): void {
    if (currentResults.length === 0) return;
    let next = activeIndex + delta;
    if (next < 0) next = currentResults.length - 1;
    if (next >= currentResults.length) next = 0;
    setActiveIndex(next);
    const activeEl = resultsEl.querySelector(`[data-index="${next}"]`);
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  function confirmActive(): void {
    if (activeIndex >= 0 && activeIndex < currentResults.length) {
      void selectEntry(currentResults[activeIndex]);
    }
  }

  // 事件绑定
  provSelect.addEventListener('sl-change', () => {
    selectedProvince = provSelect.value as string;
    selectedCity = '';
    renderCities();
    renderDistricts();
  });

  citySelect.addEventListener('sl-change', () => {
    selectedCity = citySelect.value as string;
    renderDistricts();
  });

  distSelect.addEventListener('sl-change', () => {
    const district = distSelect.value as string;
    if (!district || !selectedProvince || !selectedCity) return;
    const entry = getFlatIndex().find(
      (e) => e.province === selectedProvince && e.city === selectedCity && e.district === district,
    );
    if (entry) void selectEntry(entry);
  });

  let debounceTimer: number | null = null;
  searchInput.addEventListener('sl-input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      const q = searchInput.value.trim();
      if (!q) {
        resultsEl.style.display = 'none';
        return;
      }
      resultsEl.style.display = 'block';
      renderResults(q);
    }, 200);
  });

  searchInput.addEventListener('sl-focus', () => {
    const q = searchInput.value.trim();
    if (q) {
      resultsEl.style.display = 'block';
      renderResults(q);
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    if (resultsEl.style.display === 'none') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (activeIndex === -1) setActiveIndex(0);
      else moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (activeIndex === -1) setActiveIndex(currentResults.length - 1);
      else moveActive(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      confirmActive();
    } else if (e.key === 'Escape') {
      resultsEl.style.display = 'none';
    }
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target as Node)) {
      resultsEl.style.display = 'none';
    }
  });

  // 初始化省份/城市/区县列表
  renderProvinces();
  renderCities();
  renderDistricts();

  // 外部通过经纬度更新城市时，只同步行政区 UI，保留浏览器提供的真实坐标。
  function update(city: City): City {
    const entries = getFlatIndex();
    const districtEntry = entries.find((entry) => sameAdminName(entry.district, city.name));
    const cityEntry = entries.find((entry) => sameAdminName(entry.city, city.name));
    const provinceEntry = entries.find((entry) => sameAdminName(entry.province, city.name));
    const entry = districtEntry ?? cityEntry ?? provinceEntry;

    if (!entry) {
      // 未在行政区划库中找到时，仅更新搜索框显示
      searchInput.value = city.name;
      selectedProvince = '';
      selectedCity = '';
      renderProvinces();
      renderCities();
      renderDistricts();
      return city;
    }

    selectedProvince = entry.province;
    selectedCity = districtEntry || cityEntry ? entry.city : '';
    renderProvinces();
    renderCities();
    renderDistricts();

    if (districtEntry) {
      distSelect.value = entry.district;
      searchInput.value = entry.district;
      return { ...city, name: entry.district };
    }

    distSelect.value = '';
    const canonicalName = cityEntry ? normalizedAdminName(entry.city) : normalizedAdminName(entry.province);
    searchInput.value = canonicalName;
    return { ...city, name: canonicalName };
  }

  return { element: container, update };
}

function formatPath(e: FlatEntry): string {
  const parts = [e.city, e.province].filter(
    (c) => c && c !== '市辖区' && c !== '县' && c !== e.district,
  );
  return parts.join(' · ');
}

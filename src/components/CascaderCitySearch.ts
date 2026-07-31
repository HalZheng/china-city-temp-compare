import { searchCities } from '../api/open-meteo';
import type { City, GeocodingResult } from '../types';
import { pinyin } from 'pinyin-pro';
import pcaData from 'china-division/dist/pca.json';

// Shoelace 输入框（按需注册）
import '@shoelace-style/shoelace/dist/components/input/input.js';

export interface CascaderCitySearchProps {
  onSelect: (city: City) => void;
  defaultCity: City;
}

/** pca.json 结构：省 -> 市 -> 区县列表 */
type PcaData = Record<string, Record<string, string[]>>;

const pca = pcaData as unknown as PcaData;

/** 扁平索引项：每个区县（叶子）一条，预计算三级名称与拼音 */
interface FlatEntry {
  district: string;
  city: string;
  province: string;
  names: [string, string, string];
  pys: [string, string, string];
  inits: [string, string, string];
}

const SEARCH_LIMIT = 100;

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

/** 文字 / 全拼 / 首字母 任一级命中即匹配 */
function searchEntries(query: string): FlatEntry[] {
  const q = query.trim();
  if (!q) return [];
  const qLower = q.toLowerCase();
  const out: FlatEntry[] = [];
  for (const e of getFlatIndex()) {
    let matched = false;
    for (let i = 0; i < 3; i++) {
      if (
        e.names[i].includes(q) ||
        e.pys[i].includes(qLower) ||
        e.inits[i].includes(qLower)
      ) {
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

/** 省 -> 市 -> 区县项 的树形分组 */
function getTreeData(): Map<string, Map<string, FlatEntry[]>> {
  const tree = new Map<string, Map<string, FlatEntry[]>>();
  for (const e of getFlatIndex()) {
    let cityMap = tree.get(e.province);
    if (!cityMap) {
      cityMap = new Map();
      tree.set(e.province, cityMap);
    }
    let list = cityMap.get(e.city);
    if (!list) {
      list = [];
      cityMap.set(e.city, list);
    }
    list.push(e);
  }
  return tree;
}

// ---------------- 坐标解析（Open-Meteo geocoding） ----------------
function stripAdminSuffix(s: string): string {
  return s.replace(/(省|市|自治区|壮族自治区|维吾尔自治区|回族自治区|特别行政区)$/, '');
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

// ---------------- 样式（内联注入，CSS 变量适配夜间模式） ----------------
let styleInjected = false;
function injectStyles(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.id = 'cascader-city-search-style';
  style.textContent = `
.cascader-city-search { position: relative; }

/* sl-input：把 Shoelace 变量映射到项目主题变量 */
.cascader-city-search sl-input {
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
  --sl-input-placeholder-color: var(--text);
  --sl-input-icon-color: var(--text);
  --sl-input-focus-ring-color: var(--accent);
  --sl-focus-ring-width: 2px;
}

.cascader-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  z-index: 100;
  overflow: hidden;
}

/* 面包屑导航 */
.cascader-breadcrumb {
  display: none;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  color: var(--text);
  background: var(--surface-2);
}
.cascader-breadcrumb-item {
  cursor: pointer;
  color: var(--accent);
  padding: 2px 4px;
  border-radius: 4px;
}
.cascader-breadcrumb-item:hover { background: var(--accent-bg); }
.cascader-breadcrumb-sep { color: var(--icon); opacity: 0.6; }
.cascader-breadcrumb-current { color: var(--text-h); font-weight: 500; }

/* 三列级联面板（桌面端） */
.cascader-panels {
  display: flex;
  max-height: 340px;
}
.cascader-panel {
  flex: 1 1 0;
  min-width: 0;
  max-height: 340px;
  overflow-y: auto;
  border-right: 1px solid var(--border);
}
.cascader-panel:last-child { border-right: none; }
.cascader-panel-title {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--icon);
  background: var(--surface-2);
  position: sticky;
  top: 0;
  z-index: 1;
}
.cascader-option {
  padding: 8px 12px;
  font-size: 14px;
  color: var(--text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  transition: background 0.12s;
}
.cascader-option:hover { background: var(--accent-bg); }
.cascader-option.is-selected {
  color: var(--accent);
  font-weight: 500;
  background: var(--accent-bg);
}
.cascader-option-arrow {
  font-size: 12px;
  color: var(--icon);
  opacity: 0.7;
}

/* 搜索结果列表 */
.cascader-results {
  max-height: 340px;
  overflow-y: auto;
  padding: 4px;
}
.cascader-result {
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.cascader-result:hover { background: var(--accent-bg); }
.cascader-result-name { color: var(--text-h); font-size: 14px; }
.cascader-result-path { color: var(--icon); font-size: 12px; margin-top: 2px; }

.cascader-empty { padding: 16px 12px; color: var(--icon); font-size: 13px; text-align: center; }
.cascader-empty--error { color: var(--error); }

/* 移动端：单列视图 + 面包屑 */
@media (max-width: 640px) {
  .cascader-breadcrumb { display: flex; }
  .cascader-panels { flex-direction: column; max-height: 50vh; }
  .cascader-panel {
    display: none;
    max-height: 50vh;
    border-right: none;
    border-bottom: 1px solid var(--border);
  }
  .cascader-panel.is-active { display: block; }
  .cascader-panel:last-child { border-bottom: none; }
  .cascader-results { max-height: 50vh; }
}
`;
  document.head.appendChild(style);
}

// ---------------- 组件 ----------------
type Level = 'province' | 'city' | 'district';

export function CascaderCitySearch({ onSelect, defaultCity }: CascaderCitySearchProps): HTMLElement {
  injectStyles();

  const container = document.createElement('div');
  container.className = 'cascader-city-search';

  const inputEl = document.createElement('sl-input');
  inputEl.placeholder = '搜索城市/区县（支持拼音）';
  inputEl.value = defaultCity.name;

  const dropdown = document.createElement('div');
  dropdown.className = 'cascader-dropdown';
  dropdown.style.display = 'none';

  // 面包屑（移动端用）
  const breadcrumb = document.createElement('div');
  breadcrumb.className = 'cascader-breadcrumb';

  // 三列面板容器
  const panelsWrap = document.createElement('div');
  panelsWrap.className = 'cascader-panels';
  const provPanel = createPanel('省份');
  const cityPanel = createPanel('城市');
  const distPanel = createPanel('区县');
  panelsWrap.append(provPanel.list, cityPanel.list, distPanel.list);

  // 搜索结果容器
  const resultsWrap = document.createElement('div');
  resultsWrap.className = 'cascader-results';
  resultsWrap.style.display = 'none';

  dropdown.append(breadcrumb, panelsWrap, resultsWrap);
  container.append(inputEl, dropdown);

  let debounceTimer: number | null = null;
  let inFlight = false;

  // 当前导航状态
  const nav = { province: '', city: '' };

  function createPanel(title: string): { list: HTMLElement; titleEl: HTMLElement } {
    const list = document.createElement('div');
    list.className = 'cascader-panel';
    const titleEl = document.createElement('div');
    titleEl.className = 'cascader-panel-title';
    titleEl.textContent = title;
    list.appendChild(titleEl);
    return { list, titleEl };
  }

  function renderProvinces(): void {
    const data = getTreeData();
    provPanel.list.querySelectorAll('.cascader-option').forEach((el) => el.remove());
    for (const province of data.keys()) {
      const opt = document.createElement('div');
      opt.className = 'cascader-option';
      if (province === nav.province) opt.classList.add('is-selected');
      const nameSpan = document.createElement('span');
      nameSpan.textContent = province;
      const arrow = document.createElement('span');
      arrow.className = 'cascader-option-arrow';
      arrow.textContent = '›';
      opt.append(nameSpan, arrow);
      opt.addEventListener('click', () => {
        nav.province = province;
        nav.city = '';
        renderCities();
        updateActivePanel('city');
        updateBreadcrumb();
        renderProvinces(); // 更新高亮
      });
      provPanel.list.appendChild(opt);
    }
  }

  function renderCities(): void {
    const data = getTreeData();
    const cityMap = data.get(nav.province);
    cityPanel.list.querySelectorAll('.cascader-option').forEach((el) => el.remove());
    cityPanel.titleEl.textContent = nav.province || '城市';
    if (!cityMap) return;
    for (const city of cityMap.keys()) {
      const opt = document.createElement('div');
      opt.className = 'cascader-option';
      if (city === nav.city) opt.classList.add('is-selected');
      const nameSpan = document.createElement('span');
      nameSpan.textContent = city;
      const arrow = document.createElement('span');
      arrow.className = 'cascader-option-arrow';
      arrow.textContent = '›';
      opt.append(nameSpan, arrow);
      opt.addEventListener('click', () => {
        nav.city = city;
        renderDistricts();
        updateActivePanel('district');
        updateBreadcrumb();
        renderCities(); // 更新高亮
      });
      cityPanel.list.appendChild(opt);
    }
  }

  function renderDistricts(): void {
    const data = getTreeData();
    const entries = data.get(nav.province)?.get(nav.city);
    distPanel.list.querySelectorAll('.cascader-option').forEach((el) => el.remove());
    distPanel.titleEl.textContent = nav.city || '区县';
    if (!entries) return;
    for (const e of entries) {
      const opt = document.createElement('div');
      opt.className = 'cascader-option';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = e.district;
      opt.appendChild(nameSpan);
      opt.addEventListener('click', () => void handleSelect(e));
      distPanel.list.appendChild(opt);
    }
  }

  function updateActivePanel(level: Level): void {
    // 移动端：只显示当前层级面板
    provPanel.list.classList.toggle('is-active', level === 'province');
    cityPanel.list.classList.toggle('is-active', level === 'city');
    distPanel.list.classList.toggle('is-active', level === 'district');
  }

  function updateBreadcrumb(): void {
    breadcrumb.innerHTML = '';
    const allItem = makeCrumb('全部', () => {
      nav.province = '';
      nav.city = '';
      renderProvinces();
      renderCities();
      renderDistricts();
      updateActivePanel('province');
      updateBreadcrumb();
    });
    breadcrumb.appendChild(allItem);
    if (nav.province) {
      breadcrumb.appendChild(makeSep());
      if (nav.city) {
        // 省可点击回到省列表
        const provCrumb = makeCrumb(nav.province, () => {
          nav.city = '';
          renderCities();
          renderDistricts();
          updateActivePanel('city');
          updateBreadcrumb();
        });
        breadcrumb.appendChild(provCrumb);
        breadcrumb.appendChild(makeSep());
        const cityCrumb = document.createElement('span');
        cityCrumb.className = 'cascader-breadcrumb-current';
        cityCrumb.textContent = nav.city;
        breadcrumb.appendChild(cityCrumb);
      } else {
        const provCrumb = document.createElement('span');
        provCrumb.className = 'cascader-breadcrumb-current';
        provCrumb.textContent = nav.province;
        breadcrumb.appendChild(provCrumb);
      }
    }
  }

  function makeCrumb(text: string, onClick: () => void): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cascader-breadcrumb-item';
    el.textContent = text;
    el.addEventListener('click', onClick);
    return el;
  }
  function makeSep(): HTMLElement {
    const sep = document.createElement('span');
    sep.className = 'cascader-breadcrumb-sep';
    sep.textContent = '/';
    return sep;
  }

  function showTree(): void {
    resultsWrap.style.display = 'none';
    panelsWrap.style.display = 'flex';
    breadcrumb.style.display = window.innerWidth <= 640 ? 'flex' : 'none';
  }

  function showResults(query: string): void {
    panelsWrap.style.display = 'none';
    breadcrumb.style.display = 'none';
    resultsWrap.style.display = 'block';
    renderResults(query);
  }

  function renderResults(query: string): void {
    resultsWrap.innerHTML = '';
    const entries = searchEntries(query);
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cascader-empty';
      empty.textContent = '未找到匹配地区';
      resultsWrap.appendChild(empty);
      return;
    }
    for (const e of entries) {
      const item = document.createElement('div');
      item.className = 'cascader-result';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'cascader-result-name';
      nameSpan.textContent = e.district;
      const pathSpan = document.createElement('span');
      pathSpan.className = 'cascader-result-path';
      pathSpan.textContent = formatPath(e);
      item.append(nameSpan, pathSpan);
      item.addEventListener('click', () => void handleSelect(e));
      resultsWrap.appendChild(item);
    }
  }

  async function handleSelect(entry: FlatEntry): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    // 显示加载状态
    panelsWrap.style.display = 'none';
    breadcrumb.style.display = 'none';
    resultsWrap.style.display = 'block';
    resultsWrap.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'cascader-empty';
    loading.textContent = '正在获取坐标...';
    resultsWrap.appendChild(loading);

    try {
      const picked = await resolveCoordinates(entry);
      if (!picked) {
        resultsWrap.innerHTML = '';
        const err = document.createElement('div');
        err.className = 'cascader-empty cascader-empty--error';
        err.textContent = '未找到该地区的坐标数据';
        resultsWrap.appendChild(err);
        return;
      }
      inputEl.value = entry.district;
      closeDropdown();
      onSelect({
        name: entry.district,
        latitude: picked.latitude,
        longitude: picked.longitude,
        admin1: picked.admin1,
        country: picked.country,
      });
    } catch {
      resultsWrap.innerHTML = '';
      const err = document.createElement('div');
      err.className = 'cascader-empty cascader-empty--error';
      err.textContent = '获取坐标失败，请重试';
      resultsWrap.appendChild(err);
    } finally {
      inFlight = false;
    }
  }

  function openDropdown(): void {
    if (dropdown.style.display === 'none') {
      // 重置到省份列表
      renderProvinces();
      renderCities();
      renderDistricts();
      updateActivePanel('province');
      updateBreadcrumb();
      showTree();
      dropdown.style.display = 'block';
    }
  }

  function closeDropdown(): void {
    dropdown.style.display = 'none';
  }

  inputEl.addEventListener('sl-input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      const q = inputEl.value;
      if (dropdown.style.display === 'none') {
        dropdown.style.display = 'block';
      }
      if (q.trim()) showResults(q);
      else showTree();
    }, 200);
  });

  inputEl.addEventListener('sl-focus', () => {
    openDropdown();
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target as Node)) {
      closeDropdown();
    }
  });

  return container;
}

/** 直辖市"市辖区/县"层级在路径里冗余，省略 */
function formatPath(e: FlatEntry): string {
  const parts = [e.city, e.province].filter(
    (c) => c && c !== '市辖区' && c !== '县' && c !== e.district,
  );
  return parts.join(' · ');
}

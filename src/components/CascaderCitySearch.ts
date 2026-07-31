import { searchCities } from '../api/open-meteo';
import type { City, GeocodingResult } from '../types';
import { pinyin } from 'pinyin-pro';
import pcaData from 'china-division/dist/pca.json';

// Shoelace 组件按需注册（side-effect import）
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/tree/tree.js';
import '@shoelace-style/shoelace/dist/components/tree-item/tree-item.js';

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
  /** [区县, 市, 省] 文字名称 */
  names: [string, string, string];
  /** [区县, 市, 省] 无声调全拼 */
  pys: [string, string, string];
  /** [区县, 市, 省] 拼音首字母 */
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

/** 省 -> 市 -> 区县项 的树形分组（复用扁平索引，避免重复计算拼音） */
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

// ---------------- 坐标解析（Open-Meteo geocoding） ----------------
function stripAdminSuffix(s: string): string {
  return s.replace(/(省|市|自治区|壮族自治区|维吾尔自治区|回族自治区|特别行政区)$/, '');
}

/** 优先选 admin1 与所选省份一致的命中，避免同名区县错配 */
function pickByProvince(results: GeocodingResult[], province: string): GeocodingResult | undefined {
  const target = stripAdminSuffix(province);
  return results.find(
    (r) => !!r.admin1 && (r.admin1 === province || stripAdminSuffix(r.admin1) === target),
  );
}

async function resolveCoordinates(entry: FlatEntry): Promise<GeocodingResult | null> {
  // 1. 区县名
  let resp = await searchCities(entry.district);
  let results = resp.results ?? [];
  let picked = pickByProvince(results, entry.province) ?? results[0];

  // 2. 区县名 + 市名
  if (!picked) {
    resp = await searchCities(`${entry.district}${entry.city}`);
    results = resp.results ?? [];
    picked = pickByProvince(results, entry.province) ?? results[0];
  }

  // 3. 回退到市名
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

/* sl-input：把 Shoelace 变量映射到项目主题变量，自动跟随 light/dark */
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
  border-radius: 8px;
  box-shadow: var(--shadow);
  max-height: 320px;
  overflow-y: auto;
  z-index: 100;
  padding: 6px;
}

/* sl-tree-item 用 ::part() 穿透 shadow DOM 着色 */
.cascader-tree sl-tree-item::part(item) {
  color: var(--text);
  border-radius: 6px;
}
.cascader-tree sl-tree-item::part(label) {
  color: var(--text);
  font-size: 14px;
}
.cascader-tree sl-tree-item[data-leaf]::part(label) {
  cursor: pointer;
}
.cascader-tree sl-tree-item[data-leaf]:hover::part(item) {
  background-color: var(--accent-bg);
}
.cascader-tree sl-tree-item[data-leaf].is-active::part(item) {
  background-color: var(--accent-bg);
  color: var(--text-h);
}
.cascader-tree .cascader-tree-label { color: inherit; }
.cascader-tree .cascader-caret {
  display: inline-block;
  width: 1em;
  text-align: center;
  font-size: 12px;
  opacity: 0.85;
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
.cascader-result-path { color: var(--text); font-size: 12px; opacity: 0.85; }

.cascader-empty { padding: 12px 10px; color: var(--text); font-size: 13px; }
.cascader-empty--error { color: var(--error); }

@media (max-width: 768px) {
  .cascader-dropdown { max-height: 50vh; }
}
`;
  document.head.appendChild(style);
}

// ---------------- 组件 ----------------
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

  const treeWrap = document.createElement('div');
  treeWrap.className = 'cascader-tree';
  const tree = document.createElement('sl-tree');
  treeWrap.appendChild(tree);

  const resultsWrap = document.createElement('div');
  resultsWrap.className = 'cascader-results';
  resultsWrap.style.display = 'none';

  dropdown.appendChild(treeWrap);
  dropdown.appendChild(resultsWrap);
  container.appendChild(inputEl);
  container.appendChild(dropdown);

  let treeBuilt = false;
  let debounceTimer: number | null = null;
  let inFlight = false;

  function ensureTreeBuilt(): void {
    if (treeBuilt) return;
    treeBuilt = true;
    buildTree(tree);
  }

  function buildTree(treeEl: HTMLElement): void {
    const data = getTreeData();
    for (const [province, cityMap] of data) {
      const provItem = document.createElement('sl-tree-item');
      provItem.append(makeLabel(province));
      appendCaret(provItem);
      for (const [city, entries] of cityMap) {
        const cityItem = document.createElement('sl-tree-item');
        cityItem.append(makeLabel(city));
        appendCaret(cityItem);
        for (const e of entries) {
          const dItem = document.createElement('sl-tree-item');
          dItem.append(makeLabel(e.district));
          dItem.dataset.leaf = '1';
          dItem.addEventListener('click', () => void handleSelect(e, dItem));
          cityItem.append(dItem);
        }
        provItem.append(cityItem);
      }
      treeEl.append(provItem);
    }
  }

  function showTree(): void {
    ensureTreeBuilt();
    resultsWrap.style.display = 'none';
    treeWrap.style.display = '';
  }

  function showResults(query: string): void {
    treeWrap.style.display = 'none';
    resultsWrap.style.display = '';
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
      item.addEventListener('click', () => void handleSelect(e, null));
      resultsWrap.appendChild(item);
    }
  }

  async function handleSelect(entry: FlatEntry, leafEl: HTMLElement | null): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    // 标记当前叶子高亮
    tree.querySelectorAll('sl-tree-item.is-active').forEach((el) => el.classList.remove('is-active'));
    if (leafEl) leafEl.classList.add('is-active');

    // 下拉面板内显示加载状态
    treeWrap.style.display = 'none';
    resultsWrap.style.display = '';
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

// ---------------- DOM 小工具 ----------------
function makeLabel(text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'cascader-tree-label';
  span.textContent = text;
  return span;
}

/** 展开/折叠图标（自带 slot，避免依赖 Shoelace CDN 图标库） */
function appendCaret(item: HTMLElement): void {
  const expanded = document.createElement('span');
  expanded.slot = 'expand-icon';
  expanded.className = 'cascader-caret';
  expanded.textContent = '▾';
  const collapsed = document.createElement('span');
  collapsed.slot = 'collapse-icon';
  collapsed.className = 'cascader-caret';
  collapsed.textContent = '▸';
  item.append(expanded, collapsed);
}

/** 直辖市“市辖区/县”层级在路径里冗余，省略 */
function formatPath(e: FlatEntry): string {
  const parts = [e.city, e.province].filter(
    (c) => c && c !== '市辖区' && c !== '县' && c !== e.district,
  );
  return parts.join(' · ');
}

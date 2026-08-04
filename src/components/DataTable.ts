import type { YearlyData } from '../types';
import { getTemperatureColor } from '../utils/helpers';

interface DataTableProps {
  container: HTMLElement;
}

const ROW_HEIGHT = 40; // 每行固定高度（px），含 padding
const BUFFER = 10; // 可见区上下额外渲染的行数

export function DataTable({ container }: DataTableProps): { update: (data: YearlyData[], labels: string[]) => void; clear: () => void } {
  const wrapper = document.createElement('div');
  wrapper.className = 'data-table-wrapper';
  container.appendChild(wrapper);

  // 虚拟滚动状态
  let allRows: Array<{ type: 'data'; label: string; index: number } | { type: 'divider' }> = [];
  let yearlyData: YearlyData[] = [];
  let scrollTbody: HTMLTableSectionElement | null = null;
  let viewport: HTMLDivElement | null = null;

  function update(data: YearlyData[], labels: string[]) {
    wrapper.innerHTML = '';
    if (data.length === 0) return;

    yearlyData = data;

    // 构建行模型：数据行 + 跨年分隔行
    const splitIndex = labels.findIndex(
      (md, i) => i > 0 && labels[i - 1].startsWith('12-') && md.startsWith('01-'),
    );
    allRows = [];
    for (let i = 0; i < labels.length; i++) {
      if (splitIndex >= 0 && i === splitIndex) {
        allRows.push({ type: 'divider' as const });
      }
      allRows.push({ type: 'data' as const, label: labels[i], index: i });
    }

    const totalHeight = allRows.length * ROW_HEIGHT;

    // viewport：固定最大高度，内部滚动
    viewport = document.createElement('div');
    viewport.className = 'data-table-viewport';
    viewport.style.maxHeight = '70vh';
    viewport.style.overflowY = 'auto';
    viewport.style.position = 'relative';

    const table = document.createElement('table');
    table.className = 'data-table';
    const caption = document.createElement('caption');
    caption.textContent = '单位：℃；每格为最高 / 最低；“预”表示预报数据';
    table.appendChild(caption);

    // thead 粘性表头
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const dateTh = document.createElement('th');
    dateTh.textContent = '日期';
    dateTh.scope = 'col';
    headerRow.appendChild(dateTh);
    data.forEach((yearData) => {
      const th = document.createElement('th');
      th.textContent = `${yearData.year}年`;
      th.scope = 'col';
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // tbody：用双 spacer 撑开滚动区，仅渲染可见行。
    // 两个 spacer 高度由 renderVisible 动态计算（top=startIndex*ROW_HEIGHT，bottom=(total-endIndex)*ROW_HEIGHT），
    // 确保 tbody 总高度恒等于 allRows.length * ROW_HEIGHT，避免滚动到底出现空白。
    scrollTbody = document.createElement('tbody');
    scrollTbody.style.position = 'relative';
    const spacerTop = document.createElement('tr');
    spacerTop.style.height = '0';
    spacerTop.appendChild(document.createElement('td'));
    const spacerBottom = document.createElement('tr');
    spacerBottom.style.height = `${totalHeight}px`; // 初始值，renderVisible(0) 会立即重算
    spacerBottom.appendChild(document.createElement('td'));
    scrollTbody.appendChild(spacerTop);
    scrollTbody.appendChild(spacerBottom);

    table.appendChild(scrollTbody);
    viewport.appendChild(table);
    wrapper.appendChild(viewport);

    renderVisible(0);
    viewport.addEventListener('scroll', handleScroll, { passive: true });
  }

  function handleScroll() {
    if (!viewport) return;
    const scrollTop = viewport.scrollTop;
    renderVisible(scrollTop);
  }

  function renderVisible(scrollTop: number) {
    if (!scrollTbody || !viewport) return;
    const viewportHeight = viewport.clientHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
    const endIndex = Math.min(
      allRows.length,
      Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER,
    );

    // 清除上次渲染的可见行（保留 spacer）
    // spacerTop 在 index 0，spacerBottom 在末尾
    while (scrollTbody.childNodes.length > 2) {
      scrollTbody.removeChild(scrollTbody.childNodes[1] as ChildNode);
    }

    // 同步更新双 spacer 高度，使 tbody 总高度恒等于 allRows.length * ROW_HEIGHT
    // 旧实现只更新 top spacer，bottom spacer 始终保持 totalHeight，导致随滚动 tbody 高度不断膨胀、底部出现空白
    const spacerTop = scrollTbody.firstChild as HTMLTableRowElement;
    const spacerBottom = scrollTbody.lastChild as HTMLTableRowElement;
    spacerTop.style.height = `${startIndex * ROW_HEIGHT}px`;
    spacerBottom.style.height = `${(allRows.length - endIndex) * ROW_HEIGHT}px`;

    // 渲染可见行
    for (let i = startIndex; i < endIndex; i++) {
      const row = allRows[i];
      const tr = buildRow(row);
      // 插入到 spacerBottom 之前
      scrollTbody.insertBefore(tr, scrollTbody.lastChild);
    }
  }

  function buildRow(row: { type: 'data'; label: string; index: number } | { type: 'divider' }): HTMLTableRowElement {
    const tr = document.createElement('tr');
    if (row.type === 'divider') {
      tr.className = 'year-divider';
      const td = document.createElement('td');
      td.colSpan = 1 + yearlyData.length;
      td.textContent = '— 以下为所选年份的次年跨年段 —';
      tr.appendChild(td);
      return tr;
    }
    const dateTd = document.createElement('td');
    dateTd.textContent = row.label;
    tr.appendChild(dateTd);

    yearlyData.forEach((yearData) => {
      const td = document.createElement('td');
      const maxT = yearData.maxTemps[row.index];
      const minT = yearData.minTemps[row.index];
      td.appendChild(temperatureValue(maxT));
      const separator = document.createElement('span');
      separator.className = 'temperature-separator';
      separator.textContent = '/';
      td.appendChild(separator);
      td.appendChild(temperatureValue(minT));
      if (yearData.forecastFlags[row.index]) {
        const badge = document.createElement('span');
        badge.className = 'badge-forecast badge-forecast--compact';
        badge.textContent = '预';
        td.appendChild(badge);
      }
      tr.appendChild(td);
    });
    return tr;
  }

  function clear() {
    if (viewport) viewport.removeEventListener('scroll', handleScroll);
    wrapper.innerHTML = '';
    allRows = [];
    yearlyData = [];
    scrollTbody = null;
    viewport = null;
  }

  return { update, clear };
}

function temperatureValue(value: number | null): HTMLSpanElement {
  const span = document.createElement('span');
  if (value === null) {
    span.textContent = '—';
    span.className = 'temperature-missing';
    return span;
  }
  span.textContent = value.toFixed(1);
  const color = getTemperatureColor(value);
  if (color) {
    span.style.color = color;
    span.style.fontWeight = '600';
  }
  return span;
}

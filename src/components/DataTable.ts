import type { YearlyData } from '../types';
import { getTemperatureColor } from '../utils/helpers';

interface DataTableProps {
  container: HTMLElement;
}

export function DataTable({ container }: DataTableProps): { update: (data: YearlyData[], labels: string[]) => void; clear: () => void } {
  const wrapper = document.createElement('div');
  wrapper.className = 'data-table-wrapper';
  container.appendChild(wrapper);

  function update(data: YearlyData[], labels: string[]) {
    wrapper.innerHTML = '';
    if (data.length === 0) return;

    // 跨年分界：标签由 12-xx 过渡到 01-xx 的位置
    const splitIndex = labels.findIndex(
      (md, i) => i > 0 && labels[i - 1].startsWith('12-') && md.startsWith('01-'),
    );
    const colCount = 1 + data.length;

    const table = document.createElement('table');
    table.className = 'data-table';
    const caption = document.createElement('caption');
    caption.textContent = '单位：℃；每格为最高 / 最低；“预”表示预报数据';
    table.appendChild(caption);

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const dateTh = document.createElement('th');
    dateTh.textContent = '日期';
    headerRow.appendChild(dateTh);

    data.forEach((yearData) => {
      const th = document.createElement('th');
      th.textContent = `${yearData.year}年`;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    const tbody = document.createElement('tbody');

    for (let i = 0; i < labels.length; i++) {
      // 跨年时在年份边界插入分隔行，避免误以为下方都属列名年份
      if (splitIndex >= 0 && i === splitIndex) {
        const divider = document.createElement('tr');
        divider.className = 'year-divider';
        const td = document.createElement('td');
        td.colSpan = colCount;
        td.textContent = '— 以下为所选年份的次年跨年段 —';
        divider.appendChild(td);
        tbody.appendChild(divider);
      }

      const tr = document.createElement('tr');

      const dateTd = document.createElement('td');
      dateTd.textContent = labels[i];
      tr.appendChild(dateTd);

      data.forEach((yearData) => {
        const td = document.createElement('td');
        const maxT = yearData.maxTemps[i];
        const minT = yearData.minTemps[i];
        td.appendChild(temperatureValue(maxT));
        const separator = document.createElement('span');
        separator.className = 'temperature-separator';
        separator.textContent = '/';
        td.appendChild(separator);
        td.appendChild(temperatureValue(minT));
        if (yearData.forecastFlags[i]) {
          const badge = document.createElement('span');
          badge.className = 'badge-forecast badge-forecast--compact';
          badge.textContent = '预';
          td.appendChild(badge);
        }
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    wrapper.appendChild(table);
  }

  function clear() {
    wrapper.innerHTML = '';
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

import type { YearlyData } from '../types';
import { formatMonthDay, getTemperatureColor } from '../utils/helpers';

interface DataTableProps {
  container: HTMLElement;
}

export function DataTable({ container }: DataTableProps): { update: (data: YearlyData[]) => void; clear: () => void } {
  const wrapper = document.createElement('div');
  wrapper.className = 'data-table-wrapper';
  container.appendChild(wrapper);

  function update(data: YearlyData[]) {
    wrapper.innerHTML = '';
    if (data.length === 0) return;

    const table = document.createElement('table');
    table.className = 'data-table';

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
    const baseData = data.find((d) => d.dates.length > 0) || data[0];
    const rowCount = baseData.dates.length;

    for (let i = 0; i < rowCount; i++) {
      const tr = document.createElement('tr');

      const dateTd = document.createElement('td');
      dateTd.textContent = formatMonthDay(baseData.dates[i]);
      tr.appendChild(dateTd);

      data.forEach((yearData) => {
        const td = document.createElement('td');
        const maxT = yearData.maxTemps[i];
        const minT = yearData.minTemps[i];
        if (typeof maxT === 'number' && typeof minT === 'number') {
          const maxColor = getTemperatureColor(maxT);
          const minColor = getTemperatureColor(minT);
          const maxStyle = maxColor ? `color:${maxColor};font-weight:600;` : 'color:#374151;';
          const minStyle = minColor ? `color:${minColor};font-weight:600;` : 'color:#374151;';
          td.innerHTML = `<span style="${maxStyle}">${maxT.toFixed(1)}</span><span style="color:#9ca3af;margin:0 2px;">/</span><span style="${minStyle}">${minT.toFixed(1)}</span>`;
        } else {
          td.textContent = '-';
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

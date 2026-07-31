import type { TempType, YearSummaryStats } from '../types';

interface StatsCardsProps {
  container: HTMLElement;
}

export function StatsCards({ container }: StatsCardsProps): {
  update: (summaries: YearSummaryStats[], tempType: TempType, colors: Record<number, string>) => void;
  clear: () => void;
} {
  const wrapper = document.createElement('div');
  wrapper.className = 'stats-section';
  container.appendChild(wrapper);

  function update(summaries: YearSummaryStats[], tempType: TempType, colors: Record<number, string>) {
    wrapper.innerHTML = '';
    if (summaries.length === 0) return;

    const tempLabel = tempType === 'max' ? '最高气温' : '最低气温';

    const title = document.createElement('h2');
    title.className = 'stats-title';
    title.textContent = '逐年统计';
    wrapper.appendChild(title);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'stats-table-wrapper';
    const table = document.createElement('table');
    table.className = 'stats-table';
    table.innerHTML = `<thead><tr>
      <th>年份</th><th>${tempLabel}均值</th><th>高温日<br>≥35℃</th><th>热夜<br>≥25℃</th>
      <th>热浪<br>≥3天</th><th>寒潮<br>≥3天</th><th>严寒<br>≤-10℃</th>
      <th>冰冻日<br>≤0℃</th><th>极端寒夜<br>≤-5℃</th>
    </tr></thead>`;
    const tbody = document.createElement('tbody');
    for (const summary of summaries) {
      const row = document.createElement('tr');
      const forecastBadge = summary.includesForecast ? '<span class="badge-forecast">含预报</span>' : '';
      row.innerHTML = `<th><span class="stats-year-dot" style="background:${colors[summary.year] || 'var(--icon)'}"></span>${summary.year}${forecastBadge}</th>
        <td class="stats-average">${fmt(summary.periodAvg)}</td><td>${summary.hotDays}</td><td>${summary.tropicalNights}</td>
        <td>${summary.heatwaveCount}</td><td>${summary.coldWaveCount}</td><td>${summary.severeColdCount}</td>
        <td>${summary.freezingDays}</td><td>${summary.extremeColdNights}</td>`;
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    wrapper.appendChild(tableWrap);
  }

  function clear() {
    wrapper.innerHTML = '';
  }

  return { update, clear };
}

function fmt(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1)}℃`;
}

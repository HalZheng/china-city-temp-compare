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
    // 按 tempType 分组显示指标列，避免切到 min tab 时仍显示高温指标造成认知割裂：
    // - max tab：年份/均值(tmax)/高温日/热夜/热浪 + 寒潮/严寒/冰冻日/极端寒夜（完整 8 列）
    // - min tab：年份/均值(tmin)/寒潮/严寒/冰冻日/极端寒夜（隐藏高温日/热夜/热浪 3 列）
    const showHotCols = tempType === 'max';
    const hotColHeaders = showHotCols
      ? '<th scope="col">高温日<br>≥35℃</th><th scope="col">热夜<br>≥25℃</th><th scope="col">热浪<br>≥3天</th>'
      : '';
    table.innerHTML = `<thead><tr>
      <th scope="col">年份</th><th scope="col">${tempLabel}均值</th>${hotColHeaders}
      <th scope="col">寒潮<br>≥3天</th><th scope="col">严寒<br>≤-10℃</th>
      <th scope="col">冰冻日<br>≤0℃</th><th scope="col">极端寒夜<br>≤-5℃</th>
    </tr></thead>`;
    const tbody = document.createElement('tbody');
    for (const summary of summaries) {
      const row = document.createElement('tr');
      const forecastBadge = summary.includesForecast ? '<span class="badge-forecast">含预报</span>' : '';
      const hotColCells = showHotCols
        ? `<td>${summary.hotDays}</td><td>${summary.tropicalNights}</td><td>${summary.heatwaveCount}</td>`
        : '';
      row.innerHTML = `<th scope="row"><span class="stats-year-dot" style="background:${colors[summary.year] || 'var(--icon)'}"></span>${summary.year}${forecastBadge}</th>
        <td class="stats-average">${fmt(summary.periodAvg)}</td>${hotColCells}
        <td>${summary.coldWaveCount}</td><td>${summary.severeColdCount}</td>
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

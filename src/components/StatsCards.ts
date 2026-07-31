import type { SummaryStats, TempType } from '../types';

interface StatsCardsProps {
  container: HTMLElement;
}

export function StatsCards({ container }: StatsCardsProps): {
  update: (summary: SummaryStats, tempType: TempType) => void;
  clear: () => void;
} {
  const wrapper = document.createElement('div');
  wrapper.className = 'stats-section';
  container.appendChild(wrapper);

  function update(summary: SummaryStats, tempType: TempType) {
    wrapper.innerHTML = '';
    if (!summary) return;

    const tempLabel = tempType === 'max' ? '最高气温' : '最低气温';

    const bar = document.createElement('div');
    bar.className = 'stat-cards';
    bar.appendChild(statCard(`区间${tempLabel}均值`, fmt(summary.periodAvg), 'neutral'));
    bar.appendChild(statCard('高温日 (≥35℃)', String(summary.hotDays), 'warm'));
    bar.appendChild(statCard('热夜 (≥25℃)', String(summary.tropicalNights), 'warm'));
    bar.appendChild(statCard('高温热浪 (≥3天)', `${summary.heatwaveCount} 次`, 'warm'));
    bar.appendChild(statCard('寒潮 (≥3天)', `${summary.coldWaveCount} 次`, 'cold'));
    bar.appendChild(statCard('严寒 (≤-10℃)', `${summary.severeColdCount} 次`, 'cold'));
    bar.appendChild(statCard('冰冻日 (≤0℃)', String(summary.freezingDays), 'cold'));
    bar.appendChild(statCard('极端寒夜 (≤-5℃)', String(summary.extremeColdNights), 'cold'));
    wrapper.appendChild(bar);
  }

  function clear() {
    wrapper.innerHTML = '';
  }

  return { update, clear };
}

function statCard(label: string, value: string, tone: 'neutral' | 'warm' | 'cold'): HTMLElement {
  const card = document.createElement('div');
  card.className = `stat-card stat-${tone}`;
  const l = document.createElement('div');
  l.className = 'stat-label';
  l.textContent = label;
  const v = document.createElement('div');
  v.className = 'stat-value';
  v.textContent = value;
  card.appendChild(l);
  card.appendChild(v);
  return card;
}

function fmt(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1)}℃`;
}

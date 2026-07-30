import type { SummaryStats, TempType, YearAverage } from '../types';

interface StatsCardsProps {
  container: HTMLElement;
}

export function StatsCards({ container }: StatsCardsProps): {
  update: (summary: SummaryStats, yearAverages: YearAverage[], tempType: TempType) => void;
  clear: () => void;
} {
  const wrapper = document.createElement('div');
  wrapper.className = 'stats-section';
  container.appendChild(wrapper);

  function update(summary: SummaryStats, yearAverages: YearAverage[], tempType: TempType) {
    wrapper.innerHTML = '';
    if (!summary) return;

    const tempLabel = tempType === 'max' ? '最高气温' : '最低气温';

    const bar = document.createElement('div');
    bar.className = 'stat-cards';
    bar.appendChild(statCard(`区间平均${tempLabel}`, fmt(summary.periodAvg), 'neutral'));
    bar.appendChild(statCard('高温日 (≥35℃)', String(summary.hotDays), 'warm'));
    bar.appendChild(statCard('热夜 (≥25℃)', String(summary.tropicalNights), 'warm'));
    bar.appendChild(statCard('高温热浪 (≥3天)', `${summary.heatwaveCount} 次`, 'warm'));
    bar.appendChild(statCard('寒潮 (≥3天)', `${summary.coldWaveCount} 次`, 'cold'));
    bar.appendChild(statCard('严寒 (≤-10℃)', `${summary.severeColdCount} 次`, 'cold'));
    bar.appendChild(statCard('冰冻日 (≤0℃)', String(summary.freezingDays), 'cold'));
    bar.appendChild(statCard('极端寒夜 (≤-5℃)', String(summary.extremeColdNights), 'cold'));
    wrapper.appendChild(bar);

    const strip = document.createElement('div');
    strip.className = `year-avg-strip year-avg-strip--${tempType === 'max' ? 'warm' : 'cold'}`;
    const title = document.createElement('span');
    title.className = 'year-avg-title';
    title.textContent = `各年份平均${tempLabel}：`;
    strip.appendChild(title);
    yearAverages.forEach((ya) => {
      const chip = document.createElement('span');
      chip.className = 'year-avg-chip';
      chip.innerHTML = `<b>${ya.year}</b> ${fmt(ya.average)}`;
      strip.appendChild(chip);
    });
    wrapper.appendChild(strip);
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

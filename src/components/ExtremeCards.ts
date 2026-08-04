import type { ColdWavePeriod, HeatwavePeriod, TempType } from '../types';

interface ExtremeCardsProps {
  container: HTMLElement;
}

type AnyPeriod = HeatwavePeriod | ColdWavePeriod;

export function ExtremeCards({ container }: ExtremeCardsProps): {
  update: (heatwaves: HeatwavePeriod[], coldWaves: ColdWavePeriod[], colors: Record<number, string>, tempType: TempType) => void;
  clear: () => void;
} {
  const wrapper = document.createElement('div');
  wrapper.className = 'extreme-section';
  container.appendChild(wrapper);

  function update(heatwaves: HeatwavePeriod[], coldWaves: ColdWavePeriod[], colors: Record<number, string>, tempType: TempType) {
    wrapper.innerHTML = '';
    // 按 tempType 分组显示：max tab 显示高温热浪+寒潮，min tab 只显示寒潮（与 StatsCards 分组逻辑一致）
    if (tempType === 'max') {
      renderGroup(wrapper, '高温热浪', heatwaves, colors, false);
    }
    renderGroup(wrapper, '寒潮 / 严寒', coldWaves, colors, true);
  }

  function clear() {
    wrapper.innerHTML = '';
  }

  return { update, clear };
}

function renderGroup(
  parent: HTMLElement,
  title: string,
  periods: AnyPeriod[],
  colors: Record<number, string>,
  isCold: boolean,
) {
  if (periods.length === 0) return;

  const section = document.createElement('div');
  section.className = 'extreme-group';

  const h = document.createElement('h3');
  h.className = 'extreme-group-title';
  h.textContent = title;
  section.appendChild(h);

  const grid = document.createElement('div');
  grid.className = 'extreme-grid';

  const byYear = new Map<number, AnyPeriod[]>();
  for (const p of periods) {
    if (!byYear.has(p.year)) byYear.set(p.year, []);
    byYear.get(p.year)!.push(p);
  }

  [...byYear.entries()].sort((a, b) => b[0] - a[0]).forEach(([year, list]) => {
    const card = document.createElement('div');
    card.className = `extreme-year-card ${isCold ? 'cold' : 'warm'}`;

    const header = document.createElement('div');
    header.className = 'extreme-year-header';
    const dot = document.createElement('span');
    dot.className = 'extreme-dot';
    dot.style.background = colors[year] || 'var(--icon)';
    header.appendChild(dot);
    header.appendChild(document.createTextNode(String(year)));
    card.appendChild(header);

    const ul = document.createElement('ul');
    ul.className = 'extreme-list';
    list.forEach((p) => {
      const li = document.createElement('li');
      const kindLabel = isCold ? (p as ColdWavePeriod).kind === 'severe_cold' ? '严寒' : '寒潮' : '高温热浪';
      const range = p.startMd === p.endMd ? p.startMd : `${p.startMd} ~ ${p.endMd}`;
      const metric = isCold
        ? `最低均 ${(p as ColdWavePeriod).avgMin.toFixed(1)}℃`
        : `最高均 ${(p as HeatwavePeriod).avgMax.toFixed(1)}℃`;
      const kindSpan = document.createElement('span');
      kindSpan.className = 'extreme-kind' + (isCold && (p as ColdWavePeriod).kind === 'severe_cold' ? ' severe' : '');
      kindSpan.textContent = kindLabel;
      li.appendChild(kindSpan);
      li.appendChild(document.createTextNode(` ${range} · ${p.duration}天 · ${metric}`));
      if (p.includesForecast) {
        const badge = document.createElement('span');
        badge.className = 'badge-forecast';
        badge.textContent = '预报';
        li.appendChild(badge);
      }
      ul.appendChild(li);
    });
    card.appendChild(ul);
    grid.appendChild(card);
  });

  section.appendChild(grid);
  parent.appendChild(section);
}

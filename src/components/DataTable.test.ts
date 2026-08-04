// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { DataTable } from './DataTable';
import { buildMonthDayLabels } from '../utils/helpers';
import type { YearlyData } from '../types';

const labels = buildMonthDayLabels('01-01', '12-31'); // 366 天（用 2000 闰年作参考年）
const data: YearlyData[] = [
  {
    year: 2024,
    dates: labels,
    maxTemps: Array(366).fill(30),
    minTemps: Array(366).fill(20),
    forecastFlags: Array(366).fill(false),
  },
];

const ROW_HEIGHT = 40;
const TOTAL_ROWS = 366;

describe('DataTable 虚拟滚动', () => {
  let container: HTMLDivElement;
  let viewport: HTMLElement;
  let tbody: HTMLTableSectionElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const table = DataTable({ container });
    table.update(data, labels);
    viewport = container.querySelector('.data-table-viewport')!;
    tbody = container.querySelector('tbody')!;
    // jsdom 默认 clientHeight=0，mock 为 400 模拟可见区域
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 400 });
    // 用 mock 后的 clientHeight 重新触发一次渲染
    viewport.scrollTop = 0;
    viewport.dispatchEvent(new Event('scroll'));
  });

  function getSpacerTop(): HTMLTableRowElement {
    return tbody.firstChild as HTMLTableRowElement;
  }
  function getSpacerBottom(): HTMLTableRowElement {
    return tbody.lastChild as HTMLTableRowElement;
  }
  function getSpacerTopHeight(): number {
    return parseInt(getSpacerTop().style.height) || 0;
  }
  function getSpacerBottomHeight(): number {
    return parseInt(getSpacerBottom().style.height) || 0;
  }
  function getVisibleRowCount(): number {
    return tbody.childNodes.length - 2; // 减去两个 spacer
  }
  /** 核心不变量：spacerTop + 可见行 + spacerBottom = totalRows * ROW_HEIGHT */
  function getTbodyTotalHeight(): number {
    return getSpacerTopHeight() + getVisibleRowCount() * ROW_HEIGHT + getSpacerBottomHeight();
  }

  it('初始渲染：spacerTop=0，spacerBottom=(total-visible)*40', () => {
    // clientHeight=400, scrollTop=0
    // startIndex = max(0, floor(0/40) - 10) = 0
    // endIndex = min(366, ceil(400/40) + 10) = min(366, 10+10) = 20
    expect(getSpacerTopHeight()).toBe(0);
    expect(getSpacerBottomHeight()).toBe((TOTAL_ROWS - 20) * ROW_HEIGHT);
    expect(getTbodyTotalHeight()).toBe(TOTAL_ROWS * ROW_HEIGHT);
  });

  it('滚动到中间：双 spacer 动态更新', () => {
    viewport.scrollTop = 1000;
    viewport.dispatchEvent(new Event('scroll'));
    // startIndex = max(0, floor(1000/40) - 10) = max(0, 25-10) = 15
    // endIndex = min(366, ceil(1400/40) + 10) = min(366, 35+10) = 45
    expect(getSpacerTopHeight()).toBe(15 * ROW_HEIGHT);
    expect(getSpacerBottomHeight()).toBe((TOTAL_ROWS - 45) * ROW_HEIGHT);
    expect(getTbodyTotalHeight()).toBe(TOTAL_ROWS * ROW_HEIGHT);
  });

  it('滚动到底部：spacerBottom 归零', () => {
    // 最大 scrollTop = totalHeight - viewportHeight = 14640 - 400 = 14240
    viewport.scrollTop = 14240;
    viewport.dispatchEvent(new Event('scroll'));
    // startIndex = max(0, floor(14240/40) - 10) = max(0, 356-10) = 346
    // endIndex = min(366, ceil(14640/40) + 10) = min(366, 366+10) = 366
    expect(getSpacerTopHeight()).toBe(346 * ROW_HEIGHT);
    expect(getSpacerBottomHeight()).toBe(0);
    expect(getTbodyTotalHeight()).toBe(TOTAL_ROWS * ROW_HEIGHT);
  });

  it('tbody 总高度恒等于 allRows.length * ROW_HEIGHT（核心不变量，多滚动位置验证）', () => {
    // 修复前 bug：spacerBottom 始终保持初始值 totalHeight，随滚动 tbody 高度不断膨胀
    for (const scrollTop of [0, 200, 500, 1000, 3000, 7000, 10000, 14240]) {
      viewport.scrollTop = scrollTop;
      viewport.dispatchEvent(new Event('scroll'));
      expect(getTbodyTotalHeight()).toBe(TOTAL_ROWS * ROW_HEIGHT);
    }
  });

  it('可见行数不超过 endIndex-startIndex', () => {
    viewport.scrollTop = 2000;
    viewport.dispatchEvent(new Event('scroll'));
    // startIndex = max(0, floor(2000/40) - 10) = 50 - 10 = 40
    // endIndex = min(366, ceil(2400/40) + 10) = 60 + 10 = 70
    expect(getVisibleRowCount()).toBe(70 - 40);
  });
});

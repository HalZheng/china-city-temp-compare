import { describe, expect, it } from 'vitest';
import { buildMonthDayLabels } from './helpers';

describe('buildMonthDayLabels', () => {
  it('keeps leap day in the shared comparison axis', () => {
    expect(buildMonthDayLabels('02-28', '03-01')).toEqual(['02-28', '02-29', '03-01']);
  });

  it('keeps calendar order across the year boundary', () => {
    expect(buildMonthDayLabels('12-29', '01-02')).toEqual([
      '12-29',
      '12-30',
      '12-31',
      '01-01',
      '01-02',
    ]);
  });

  it('includes 02-29 in wrapping range crossing leap-day (start > end, covers Feb)', () => {
    // 跨年区间 12-01 → 03-15 必须包含 02-29，否则闰年 02-29 数据被丢弃
    const labels = buildMonthDayLabels('12-01', '03-15');
    expect(labels).toContain('02-29');
    // 校验关键节点顺序：12-01 起始 → 12-31 → 01-01 → 02-29 → 03-15
    expect(labels[0]).toBe('12-01');
    expect(labels).toContain('12-31');
    expect(labels).toContain('01-01');
    expect(labels[labels.length - 1]).toBe('03-15');
    // 总天数 = 31(12月) + 31(1月) + 29(2月闰) + 15(3月) = 106
    expect(labels).toHaveLength(106);
  });

  it('includes 02-29 in wrapping range 12-31 → 02-29 (ends on leap day)', () => {
    const labels = buildMonthDayLabels('12-31', '02-29');
    expect(labels[0]).toBe('12-31');
    expect(labels[labels.length - 1]).toBe('02-29');
    // 12-31 + 1月31天 + 2月29天 = 61
    expect(labels).toHaveLength(61);
  });
});

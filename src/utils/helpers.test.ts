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
});

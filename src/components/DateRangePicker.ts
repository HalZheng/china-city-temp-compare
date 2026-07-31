import flatpickr from 'flatpickr';
import { Mandarin } from 'flatpickr/dist/l10n/zh.js';
import 'flatpickr/dist/flatpickr.css';
import { getDefaultDateRange, validateMonthDayRange, getMonthDayFromDate } from '../utils/helpers';

interface DateRangePickerProps {
  onChange: (start: string, end: string) => void;
}

/**
 * 日期范围选择器：基于 flatpickr 的日历范围选择。
 * - 月-日范围语义：用户在日历上选两个日期，内部仅取 MM-DD 用于跨年对比
 * - 中文 locale、移动端自适应、夜间模式（通过 CSS 变量覆盖）
 */
export function DateRangePicker({ onChange }: DateRangePickerProps): HTMLElement {
  const container = document.createElement('div');
  container.className = 'date-range-picker';

  const defaultRange = getDefaultDateRange();

  // 输入框：flatpickr 会接管此 input
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'date-input flatpickr-input';
  input.readOnly = true;
  // 初始显示：仅月-日
  const startMd = getMonthDayFromDate(defaultRange.start);
  const endMd = getMonthDayFromDate(defaultRange.end);
  input.value = `${startMd} 至 ${endMd}`;

  const errorMsg = document.createElement('span');
  errorMsg.className = 'date-error';

  // flatpickr 实例：range 模式，中文，只显示月日
  const fp = flatpickr(input, {
    mode: 'range',
    locale: Mandarin,
    dateFormat: 'm-d',
    defaultDate: [defaultRange.start, defaultRange.end],
    allowInput: false,
    clickOpens: true,
    // 移动端：flatpickr 默认 static 定位，避免被遮挡
    static: true,
    onChange: (selectedDates) => {
      if (selectedDates.length === 2) {
        const startMd = getMonthDayFromDate(formatDateFromJsDate(selectedDates[0]));
        const endMd = getMonthDayFromDate(formatDateFromJsDate(selectedDates[1]));
        // 跨年区间（如 12-01 至 02-28）合法，提示用户
        if (!validateMonthDayRange(startMd, endMd)) {
          errorMsg.textContent = '已选择跨年区间：将对比每年该时段（起始年→次年）';
          errorMsg.classList.remove('date-error-invalid');
          errorMsg.classList.add('date-error-info');
        } else {
          errorMsg.textContent = '';
          errorMsg.classList.remove('date-error-info', 'date-error-invalid');
        }
        // 显示用 "MM-DD 至 MM-DD"
        input.value = `${startMd} 至 ${endMd}`;
        onChange(startMd, endMd);
      }
    },
  });

  // 保留引用避免被 GC（flatpickr 实例需要存活）
  (container as any)._flatpickr = fp;

  container.appendChild(input);
  container.appendChild(errorMsg);

  // 初始通知
  onChange(startMd, endMd);

  return container;
}

function formatDateFromJsDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

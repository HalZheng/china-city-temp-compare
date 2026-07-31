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
 * - 关键：flatpickr 必须在 input 挂载到 DOM 后初始化，否则事件绑定失败
 */
export function DateRangePicker({ onChange }: DateRangePickerProps): HTMLElement {
  const container = document.createElement('div');
  container.className = 'date-range-picker';

  const defaultRange = getDefaultDateRange();

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'date-input';
  input.readOnly = true;
  const startMd = getMonthDayFromDate(defaultRange.start);
  const endMd = getMonthDayFromDate(defaultRange.end);
  input.value = `${startMd} 至 ${endMd}`;

  const errorMsg = document.createElement('span');
  errorMsg.className = 'date-error';

  container.appendChild(input);
  container.appendChild(errorMsg);

  // 延迟到元素挂载到 DOM 后再初始化 flatpickr（用 microtask 确保挂载完成）
  const initFlatpickr = () => {
    flatpickr(input, {
      mode: 'range',
      locale: Mandarin,
      dateFormat: 'm-d',
      defaultDate: [defaultRange.start, defaultRange.end],
      allowInput: false,
      clickOpens: true,
      static: true,
      onChange: (selectedDates) => {
        if (selectedDates.length === 2) {
          const sMd = getMonthDayFromDate(formatDateFromJsDate(selectedDates[0]));
          const eMd = getMonthDayFromDate(formatDateFromJsDate(selectedDates[1]));
          if (!validateMonthDayRange(sMd, eMd)) {
            errorMsg.textContent = '已选择跨年区间：将对比每年该时段（起始年→次年）';
            errorMsg.classList.remove('date-error-invalid');
            errorMsg.classList.add('date-error-info');
          } else {
            errorMsg.textContent = '';
            errorMsg.classList.remove('date-error-info', 'date-error-invalid');
          }
          input.value = `${sMd} 至 ${eMd}`;
          onChange(sMd, eMd);
        }
      },
    });
  };

  // 用 requestAnimationFrame 等待挂载完成（container 被 appendChild 到 DOM 后）
  requestAnimationFrame(() => {
    if (document.contains(input)) {
      initFlatpickr();
    } else {
      // 兜底：MutationObserver 监听挂载
      const obs = new MutationObserver(() => {
        if (document.contains(input)) {
          obs.disconnect();
          initFlatpickr();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  });

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

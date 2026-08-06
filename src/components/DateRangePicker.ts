import flatpickr from 'flatpickr';
import { Mandarin } from 'flatpickr/dist/l10n/zh.js';
import 'flatpickr/dist/flatpickr.css';
import { getDefaultDateRange, getMonthDayFromDate } from '../utils/helpers';

export interface DateRangePickerInstance {
  element: HTMLElement;
  setRange: (start: string, end: string) => void;
}

interface DateRangePickerProps {
  onChange: (start: string, end: string) => void;
}

interface MonthDayInput {
  wrap: HTMLDivElement;
  input: HTMLInputElement;
  label: string;
  fp?: flatpickr.Instance;
}

/**
 * 日期范围选择器：两个独立的月-日选择器，支持跨年区间。
 * - 左侧选择起始月日，右侧选择结束月日
 * - 允许起始月日 > 结束月日（如 12-01 至 02-28），用于跨年对比
 * - 中文 locale、移动端自适应、夜间模式（通过 CSS 变量覆盖）
 */
export function DateRangePicker({ onChange }: DateRangePickerProps): DateRangePickerInstance {
  const container = document.createElement('div');
  container.className = 'date-range-picker';

  const defaultRange = getDefaultDateRange();
  const REFERENCE_YEAR = 2000; // 闰年参考，保证 02-29 可选

  function monthDayToDate(monthDay: string): Date {
    return new Date(`${REFERENCE_YEAR}-${monthDay}T00:00:00`);
  }

  const startInput = createMonthDayInput('起始日期');
  const endInput = createMonthDayInput('结束日期');

  const startMd = getMonthDayFromDate(defaultRange.start);
  const endMd = getMonthDayFromDate(defaultRange.end);
  let selectedStartMd = startMd;
  let selectedEndMd = endMd;
  startInput.input.value = startMd;
  endInput.input.value = endMd;

  const sep = document.createElement('span');
  sep.className = 'date-separator';
  sep.textContent = '至';

  const hint = document.createElement('div');
  hint.className = 'date-hint';

  container.append(startInput.wrap, sep, endInput.wrap, hint);

  // 同步通知默认值，避免外部在 flatpickr 异步初始化完成前就使用空字符串
  emit(startMd, endMd);

  function emit(sMd: string, eMd: string) {
    selectedStartMd = sMd;
    selectedEndMd = eMd;
    const isWrap = sMd > eMd;
    hint.textContent = isWrap ? '已选择跨年区间：将对比每年该时段（起始年→次年）' : '';
    hint.classList.toggle('date-hint--info', isWrap);
    onChange(sMd, eMd);
  }

  function createMonthDayInput(label: string): MonthDayInput {
    const wrap = document.createElement('div');
    wrap.className = 'date-input-wrap';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'date-input';
    input.readOnly = true;
    input.setAttribute('aria-label', label);

    const labelEl = document.createElement('label');
    labelEl.className = 'control-label';
    labelEl.textContent = label;
    labelEl.appendChild(input);
    wrap.appendChild(labelEl);
    return { wrap, input, label };
  }

  function notify() {
    if (!startInput.fp || !endInput.fp) return;
    const sDate = startInput.fp.selectedDates[0];
    const eDate = endInput.fp.selectedDates[0];
    if (!sDate || !eDate) return;
    const sMd = getMonthDayFromDate(formatDateFromJsDate(sDate));
    const eMd = getMonthDayFromDate(formatDateFromJsDate(eDate));
    emit(sMd, eMd);
  }

  function initFlatpickr(input: HTMLInputElement, defaultDate: string) {
    return flatpickr(input, {
      locale: Mandarin,
      dateFormat: 'm-d',
      defaultDate: monthDayToDate(defaultDate),
      // 锁定在参考闰年 2000 内：防止翻月/翻年越界导致 02-29 消失
      minDate: `${REFERENCE_YEAR}-01-01`,
      maxDate: `${REFERENCE_YEAR}-12-31`,
      allowInput: false,
      clickOpens: true,
      static: false,
      onChange: () => notify(),
    });
  }

  function setRange(start: string, end: string) {
    startInput.input.value = start;
    endInput.input.value = end;
    if (startInput.fp) startInput.fp.setDate(monthDayToDate(start), true);
    if (endInput.fp) endInput.fp.setDate(monthDayToDate(end), true);
    emit(start, end);
  }

  // 延迟到挂载 DOM 后初始化
  requestAnimationFrame(() => {
    if (document.contains(container)) {
      startInput.fp = initFlatpickr(startInput.input, selectedStartMd);
      endInput.fp = initFlatpickr(endInput.input, selectedEndMd);
      notify();
    } else {
      const obs = new MutationObserver(() => {
        if (document.contains(container)) {
          obs.disconnect();
          startInput.fp = initFlatpickr(startInput.input, selectedStartMd);
          endInput.fp = initFlatpickr(endInput.input, selectedEndMd);
          notify();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  });

  return { element: container, setRange };
}

function formatDateFromJsDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}


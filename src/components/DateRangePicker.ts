import { getDefaultDateRange, validateMonthDayRange, getMonthDayFromDate } from '../utils/helpers';

interface DateRangePickerProps {
  onChange: (start: string, end: string) => void;
}

export function DateRangePicker({ onChange }: DateRangePickerProps): HTMLElement {
  const container = document.createElement('div');
  container.className = 'date-range-picker';

  const defaultRange = getDefaultDateRange();

  const startInput = document.createElement('input');
  startInput.type = 'date';
  startInput.className = 'date-input';
  startInput.value = defaultRange.start;

  const endInput = document.createElement('input');
  endInput.type = 'date';
  endInput.className = 'date-input';
  endInput.value = defaultRange.end;

  const separator = document.createElement('span');
  separator.textContent = ' 至 ';
  separator.className = 'date-separator';

  const errorMsg = document.createElement('span');
  errorMsg.className = 'date-error';

  function validateAndNotify() {
    const start = startInput.value;
    const end = endInput.value;
    if (!start || !end) return;

    const startMonthDay = getMonthDayFromDate(start);
    const endMonthDay = getMonthDayFromDate(end);

    if (!validateMonthDayRange(startMonthDay, endMonthDay)) {
      // 跨年区间（如 12-01 至 02-28）是合法的，表示"起始年→次年"
      errorMsg.textContent = '已选择跨年区间：将对比每年该时段（起始年→次年）';
      errorMsg.classList.remove('date-error-invalid');
      errorMsg.classList.add('date-error-info');
    } else {
      errorMsg.textContent = '';
      errorMsg.classList.remove('date-error-info', 'date-error-invalid');
    }
    onChange(startMonthDay, endMonthDay);
  }

  startInput.addEventListener('change', validateAndNotify);
  endInput.addEventListener('change', validateAndNotify);

  container.appendChild(startInput);
  container.appendChild(separator);
  container.appendChild(endInput);
  container.appendChild(errorMsg);

  // Initial notification
  validateAndNotify();

  return container;
}

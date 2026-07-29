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
      errorMsg.textContent = '起始月日不能晚于结束月日';
      return;
    }
    errorMsg.textContent = '';
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

import { getRecentYears } from '../utils/helpers';

interface YearSelectorProps {
  onChange: (years: number[]) => void;
}

export interface YearSelectorInstance {
  element: HTMLElement;
  setYears: (years: number[]) => void;
}

export function YearSelector({ onChange }: YearSelectorProps): YearSelectorInstance {
  const container = document.createElement('div');
  container.className = 'year-selector';

  const allYears = getRecentYears(20, false);
  const defaultYears = getRecentYears(5, false);
  let selectedYears = new Set<number>(defaultYears);

  const header = document.createElement('div');
  header.className = 'year-selector-header';

  const title = document.createElement('span');
  title.textContent = '选择年份';
  title.className = 'year-selector-title';

  const hint = document.createElement('span');
  hint.className = 'year-hint';

  const buttons = document.createElement('div');
  buttons.className = 'year-buttons';

  const selectAllBtn = document.createElement('button');
  selectAllBtn.type = 'button';
  selectAllBtn.textContent = '全选';
  selectAllBtn.className = 'year-btn';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.textContent = '清空';
  clearBtn.className = 'year-btn';

  buttons.appendChild(selectAllBtn);
  buttons.appendChild(clearBtn);
  header.appendChild(title);
  header.appendChild(buttons);

  const checkboxContainer = document.createElement('div');
  checkboxContainer.className = 'year-checkboxes';

  const checkboxes: { year: number; input: HTMLInputElement }[] = [];

  function updateHint() {
    hint.textContent = `已选 ${selectedYears.size}/10 年`;
    if (selectedYears.size > 10) {
      hint.classList.add('year-hint-error');
    } else {
      hint.classList.remove('year-hint-error');
    }
  }

  function notify() {
    updateHint();
    onChange(Array.from(selectedYears).sort((a, b) => a - b));
  }

  allYears.forEach((year) => {
    const label = document.createElement('label');
    label.className = 'year-checkbox-label';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = year.toString();
    input.checked = selectedYears.has(year);

    const span = document.createElement('span');
    span.textContent = year.toString();

    input.addEventListener('change', () => {
      if (input.checked) {
        if (selectedYears.size >= 10) {
          input.checked = false;
          return;
        }
        selectedYears.add(year);
      } else {
        selectedYears.delete(year);
      }
      notify();
    });

    label.appendChild(input);
    label.appendChild(span);
    checkboxContainer.appendChild(label);
    checkboxes.push({ year, input });
  });

  selectAllBtn.addEventListener('click', () => {
    const toSelect = allYears.slice(-10);
    selectedYears = new Set(toSelect);
    checkboxes.forEach(({ year, input }) => {
      input.checked = selectedYears.has(year);
    });
    notify();
  });

  clearBtn.addEventListener('click', () => {
    selectedYears.clear();
    checkboxes.forEach(({ input }) => {
      input.checked = false;
    });
    notify();
  });

  container.appendChild(header);
  container.appendChild(hint);
  container.appendChild(checkboxContainer);

  function setYears(years: number[]) {
    selectedYears = new Set(years.filter((y) => allYears.includes(y)).slice(0, 10));
    checkboxes.forEach(({ year, input }) => {
      input.checked = selectedYears.has(year);
    });
    notify();
  }

  updateHint();
  onChange(Array.from(selectedYears).sort((a, b) => a - b));

  return { element: container, setYears };
}

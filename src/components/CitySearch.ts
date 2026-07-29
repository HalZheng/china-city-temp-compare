import { searchCities } from '../api/open-meteo';
import type { City, GeocodingResult } from '../types';

interface CitySearchProps {
  onSelect: (city: City) => void;
  defaultCity: City;
}

export function CitySearch({ onSelect, defaultCity }: CitySearchProps): HTMLElement {
  const container = document.createElement('div');
  container.className = 'city-search';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '搜索中国城市...';
  input.className = 'city-input';
  input.value = defaultCity.name;

  const dropdown = document.createElement('div');
  dropdown.className = 'city-dropdown';

  let debounceTimer: number | null = null;
  let results: GeocodingResult[] = [];

  function selectCity(city: City) {
    input.value = city.name;
    dropdown.style.display = 'none';
    onSelect(city);
  }

  async function handleSearch(query: string) {
    if (!query.trim()) {
      dropdown.style.display = 'none';
      return;
    }
    try {
      const data = await searchCities(query.trim());
      results = data.results || [];
      renderDropdown();
    } catch {
      dropdown.style.display = 'none';
    }
  }

  function renderDropdown() {
    if (results.length === 0) {
      dropdown.style.display = 'none';
      return;
    }
    dropdown.innerHTML = '';
    results.forEach((result) => {
      const item = document.createElement('div');
      item.className = 'city-dropdown-item';
      const adminText = result.admin1 ? ` (${result.admin1})` : '';
      item.textContent = `${result.name}${adminText}`;
      item.addEventListener('click', () => {
        selectCity({
          name: result.name,
          latitude: result.latitude,
          longitude: result.longitude,
          admin1: result.admin1,
          country: result.country,
        });
      });
      dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
  }

  input.addEventListener('input', () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      handleSearch(input.value);
    }, 300);
  });

  input.addEventListener('focus', () => {
    if (results.length > 0) {
      dropdown.style.display = 'block';
    }
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target as Node)) {
      dropdown.style.display = 'none';
    }
  });

  container.appendChild(input);
  container.appendChild(dropdown);
  return container;
}

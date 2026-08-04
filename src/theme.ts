/**
 * 主题切换模块：三态循环 light → dark → auto（跟随系统）→ light。
 * - 持久化到 localStorage('theme')，默认 auto
 * - auto 模式移除 data-theme 属性，让 CSS 走 prefers-color-scheme
 * - light/dark 模式设置 data-theme 属性覆盖系统主题
 * - 主题变化时通过 onThemeChange 回调通知（用于重绘图表读取新 CSS 变量）
 */
export type ThemeMode = 'light' | 'dark' | 'auto';

const THEME_ICON: Record<ThemeMode, string> = { light: '☀', dark: '☾', auto: '◐' };
const THEME_LABEL: Record<ThemeMode, string> = { light: '浅色', dark: '深色', auto: '跟随系统' };

export interface ThemeToggleInstance {
  element: HTMLButtonElement;
  applyTheme: (mode: ThemeMode) => void;
  getCurrentMode: () => ThemeMode;
}

export function createThemeToggle(onThemeChange: () => void): ThemeToggleInstance {
  const themeToggle = document.createElement('button');
  themeToggle.type = 'button';
  themeToggle.className = 'theme-toggle';
  themeToggle.title = '切换主题';
  themeToggle.setAttribute('aria-label', '切换主题');

  function applyTheme(mode: ThemeMode): void {
    if (mode === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', mode);
    }
    localStorage.setItem('theme', mode);
    themeToggle.innerHTML = `<span class="icon-theme">${THEME_ICON[mode]}</span><span class="label-theme">${THEME_LABEL[mode]}</span>`;
    themeToggle.title = `当前：${THEME_LABEL[mode]}（点击切换）`;
    // 通知图表重绘（读取新 CSS 变量值）
    onThemeChange();
  }

  function getCurrentMode(): ThemeMode {
    return (localStorage.getItem('theme') as ThemeMode | null) ?? 'auto';
  }

  themeToggle.addEventListener('click', () => {
    const current = getCurrentMode();
    const next: ThemeMode = current === 'light' ? 'dark' : current === 'dark' ? 'auto' : 'light';
    applyTheme(next);
  });

  // 读取持久化的主题模式，默认 auto
  const savedTheme = (localStorage.getItem('theme') as ThemeMode | null) ?? 'auto';
  applyTheme(savedTheme);

  // auto 模式下系统主题变化时也重绘
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getCurrentMode() === 'auto') {
      onThemeChange();
    }
  });

  return { element: themeToggle, applyTheme, getCurrentMode };
}

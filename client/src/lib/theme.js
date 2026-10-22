const THEME_STORAGE_KEY = 'tokengate.theme';
export const THEME_PREFERENCES = ['system', 'light', 'dark'];

export function readThemePreference() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_PREFERENCES.includes(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Writes the resolved theme onto <html>; index.html does the same before first paint. */
export function applyThemePreference(preference) {
  const theme = preference === 'system' ? systemTheme() : preference;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Not persisted; the choice still applies to this tab.
  }
  return theme;
}

/** Calls `listener` when the OS theme changes (only matters for "system"). */
export function watchSystemTheme(listener) {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

import { useEffect, useState } from 'react';
import { applyThemePreference, readThemePreference, watchSystemTheme } from '../lib/theme.js';

export function useTheme() {
  const [preference, setPreference] = useState(readThemePreference);

  useEffect(() => {
    applyThemePreference(preference);
    if (preference !== 'system') return undefined;
    return watchSystemTheme(() => applyThemePreference('system'));
  }, [preference]);

  return { preference, setPreference };
}

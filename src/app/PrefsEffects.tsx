import { useMantineColorScheme } from '@mantine/core';
import { useEffect } from 'react';
import { usePrefs } from '@/store/prefsStore';

/** Applies device preferences that affect the whole page (theme, density). */
export function PrefsEffects() {
  const theme = usePrefs((s) => s.theme);
  const density = usePrefs((s) => s.density);
  const { setColorScheme } = useMantineColorScheme();

  useEffect(() => {
    setColorScheme(theme);
  }, [theme, setColorScheme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  return null;
}

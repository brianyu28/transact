import { useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { useEffect } from 'react';
import { usePrefs } from '@/store/prefsStore';

/** Applies device preferences that affect the whole page (theme, density). */
export function PrefsEffects() {
  const theme = usePrefs((s) => s.theme);
  const density = usePrefs((s) => s.density);
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light');

  useEffect(() => {
    setColorScheme(theme);
  }, [theme, setColorScheme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  // The browser/window chrome color (the installed app's title bar and window controls):
  // match the page background (--tx-bg) so it blends in.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = scheme === 'dark' ? '#15181c' : '#ffffff';
  }, [scheme]);

  return null;
}

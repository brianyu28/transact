/**
 * Device preferences: stored in this browser (localStorage), not in the data file, so
 * each device keeps its own look and feel. Declared alongside file settings in
 * `domain/settings/registry.ts`.
 */
import { useStore } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

export type ThemePref = 'auto' | 'light' | 'dark';
export type DensityPref = 'compact' | 'comfortable';
export type DateFormatPref = 'medium' | 'numeric' | 'iso';

export interface DevicePrefs {
  theme: ThemePref;
  density: DensityPref;
  dateFormat: DateFormatPref;
  sidebarCollapsed: boolean;
  /** Whether the Income report counts transactions excluded from budgets. */
  incomeIncludesExcluded: boolean;
  /** User overrides of keyboard shortcuts: command id → key sequences. */
  keybindings: Record<string, string[]>;
}

export const DEFAULT_PREFS: DevicePrefs = {
  theme: 'auto',
  density: 'compact',
  dateFormat: 'medium',
  sidebarCollapsed: false,
  incomeIncludesExcluded: true,
  keybindings: {},
};

interface PrefsActions {
  setPref: <K extends keyof DevicePrefs>(key: K, value: DevicePrefs[K]) => void;
  setKeybinding: (commandId: string, keys: string[] | null) => void;
  resetKeybindings: () => void;
}

export const PREFS_STORAGE_KEY = 'transact:prefs';

export const prefsStore = createStore<DevicePrefs & PrefsActions>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      setPref: (key, value) => {
        set({ [key]: value });
      },
      setKeybinding: (commandId, keys) => {
        set((s) => {
          const keybindings = { ...s.keybindings };
          if (keys === null) Reflect.deleteProperty(keybindings, commandId);
          else keybindings[commandId] = keys;
          return { keybindings };
        });
      },
      resetKeybindings: () => {
        set({ keybindings: {} });
      },
    }),
    {
      name: PREFS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: ({
        theme,
        density,
        dateFormat,
        sidebarCollapsed,
        incomeIncludesExcluded,
        keybindings,
      }) => ({
        theme,
        density,
        dateFormat,
        sidebarCollapsed,
        incomeIncludesExcluded,
        keybindings,
      }),
    },
  ),
);

export function usePrefs<T>(selector: (state: DevicePrefs & PrefsActions) => T): T {
  return useStore(prefsStore, selector);
}

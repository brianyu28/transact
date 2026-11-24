/** Transient UI state shared across components (not persisted). */
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

interface UiState {
  paletteOpen: boolean;
  helpOpen: boolean;
}

export const uiStore = createStore<UiState>()(() => ({ paletteOpen: false, helpOpen: false }));

export function useUi<T>(selector: (s: UiState) => T): T {
  return useStore(uiStore, selector);
}

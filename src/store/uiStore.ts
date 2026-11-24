/** Transient UI state shared across components (not persisted). */
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

interface UiState {
  paletteOpen: boolean;
  helpOpen: boolean;
  /** Dropbox file dialog: choosing a file to open, or naming a file to save. */
  dropboxDialog: 'open' | 'save' | null;
}

export const uiStore = createStore<UiState>()(() => ({
  paletteOpen: false,
  helpOpen: false,
  dropboxDialog: null,
}));

export function useUi<T>(selector: (s: UiState) => T): T {
  return useStore(uiStore, selector);
}

/** Lightweight toasts (e.g. "Deleted 3 transactions · Undo"). */
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
  action?: { label: string; run: () => void };
}

const DURATION_MS = 5000;
let nextId = 1;

export const toastStore = createStore<{ toasts: Toast[] }>()(() => ({ toasts: [] }));

export function dismissToast(id: number): void {
  toastStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function toast(message: string, options: Partial<Omit<Toast, 'id' | 'message'>> = {}): void {
  const t: Toast = {
    id: nextId++,
    message,
    kind: options.kind ?? 'info',
    ...(options.action ? { action: options.action } : {}),
  };
  // Keep at most three on screen.
  toastStore.setState((s) => ({ toasts: [...s.toasts.slice(-2), t] }));
  setTimeout(() => {
    dismissToast(t.id);
  }, DURATION_MS);
}

export function useToasts(): Toast[] {
  return useStore(toastStore, (s) => s.toasts);
}

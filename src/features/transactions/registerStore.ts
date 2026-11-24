/** UI state of the transaction register (filter, cursor, selection, editor). */
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { Id } from '@/domain/schema/types';

export type Dialog =
  { kind: 'category'; ids: Id[] } | { kind: 'tags'; ids: Id[] } | { kind: 'split'; id: Id } | null;

/** `editing` value for the new-transaction entry row. */
export const NEW_ENTRY = 'new';

export interface RegisterState {
  query: string;
  /** The row with the keyboard cursor. */
  activeId: Id | null;
  selected: ReadonlySet<Id>;
  /** Row being edited inline: a transaction id, NEW_ENTRY for the entry row, or null. */
  editing: string | null;
  dialog: Dialog;
}

export const registerStore = createStore<RegisterState>()(() => ({
  query: '',
  activeId: null,
  selected: new Set(),
  editing: null,
  dialog: null,
}));

export function useRegister<T>(selector: (s: RegisterState) => T): T {
  return useStore(registerStore, selector);
}

export const registerActions = {
  setQuery: (query: string) => {
    registerStore.setState({ query });
  },
  toggleSelected: (id: Id) => {
    const selected = new Set(registerStore.getState().selected);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    registerStore.setState({ selected });
  },
  selectRange: (ids: readonly Id[], from: Id, to: Id) => {
    const a = ids.indexOf(from);
    const b = ids.indexOf(to);
    if (a < 0 || b < 0) return;
    const selected = new Set(registerStore.getState().selected);
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) selected.add(ids[i] as Id);
    registerStore.setState({ selected });
  },
  clearSelection: () => {
    registerStore.setState({ selected: new Set() });
  },
  /** Ids an action applies to: the selection, or else the active row. */
  targets: (): Id[] => {
    const { selected, activeId } = registerStore.getState();
    if (selected.size > 0) return [...selected];
    // Balance-update rows (snp_…) can be the cursor but aren't transactions.
    return activeId?.startsWith('txn_') ? [activeId] : [];
  },
};

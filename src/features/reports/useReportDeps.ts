import { useDocStore } from '@/store/docStore';

/** The document parts reports depend on; reports recompute only when these change. */
export function useReportDeps() {
  return {
    index: useDocStore((s) => s.index),
    indexVersion: useDocStore((s) => s.indexVersion),
    categories: useDocStore((s) => s.doc?.categories),
    accounts: useDocStore((s) => s.doc?.accounts),
    snapshots: useDocStore((s) => s.doc?.balanceSnapshots),
    budgets: useDocStore((s) => s.doc?.budgets),
    settings: useDocStore((s) => s.doc?.settings),
    transactions: useDocStore((s) => s.doc?.transactions),
  };
}

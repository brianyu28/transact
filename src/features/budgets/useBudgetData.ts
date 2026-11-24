import { useMemo } from 'react';
import {
  budgetView,
  customBudgetViews,
  rolloverSuggestions,
  type BudgetView,
  type CustomBudgetView,
  type RolloverRow,
} from '@/domain/budgets/views';
import type { PeriodKey } from '@/domain/budgets/periods';
import type { BudgetTier } from '@/domain/schema/types';
import { today } from '@/lib/date';
import { useDocStore } from '@/store/docStore';

/** Inputs budget computations depend on; recompute only when one of these changes. */
function useBudgetDeps() {
  return {
    index: useDocStore((s) => s.index),
    indexVersion: useDocStore((s) => s.indexVersion),
    budgets: useDocStore((s) => s.doc?.budgets),
    categories: useDocStore((s) => s.doc?.categories),
    settings: useDocStore((s) => s.doc?.settings),
    tags: useDocStore((s) => s.doc?.tags),
    transactions: useDocStore((s) => s.doc?.transactions),
  };
}

export function useBudgetView(cadence: BudgetTier, key: PeriodKey): BudgetView | null {
  const { index, indexVersion, budgets, categories, settings, transactions } = useBudgetDeps();
  return useMemo(() => {
    if (!index || !budgets || !categories || !settings || !transactions) return null;
    return budgetView(
      { budgets, categories, settings, transactions },
      index,
      cadence,
      key,
      today(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indexVersion tracks in-place index changes.
  }, [index, indexVersion, budgets, categories, settings, cadence, key]);
}

export function useCustomBudgetViews(): CustomBudgetView[] {
  const { index, indexVersion, budgets, categories, settings, tags, transactions } =
    useBudgetDeps();
  return useMemo(() => {
    if (!index || !budgets || !categories || !settings || !tags || !transactions) return [];
    return customBudgetViews({ budgets, categories, settings, tags, transactions }, index, today());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indexVersion tracks in-place index changes.
  }, [index, indexVersion, budgets, categories, settings, tags]);
}

export function useRolloverSuggestions(cadence: BudgetTier, key: PeriodKey | null): RolloverRow[] {
  const { index, indexVersion, budgets, categories, settings, transactions } = useBudgetDeps();
  return useMemo(() => {
    if (!key || !index || !budgets || !categories || !settings || !transactions) return [];
    return rolloverSuggestions(
      { budgets, categories, settings, transactions },
      index,
      cadence,
      key,
      today(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indexVersion tracks in-place index changes.
  }, [index, indexVersion, budgets, categories, settings, cadence, key]);
}

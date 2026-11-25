/**
 * Planning items on a budget line: expected costs the line's amount should cover. They are
 * a planning aid only and never change what is budgeted.
 */
import type { Cents, PlanItem } from '../schema/types';

export type PlanStatus = 'exact' | 'buffer' | 'short';

export interface PlanSummary {
  /** Sum of the plan items. */
  planned: Cents;
  /** Budgeted minus planned: positive is a buffer, negative a shortfall. */
  difference: Cents;
  status: PlanStatus;
}

export function planTotal(items: readonly PlanItem[] | undefined): Cents {
  return (items ?? []).reduce((sum, item) => sum + item.amount, 0);
}

/** Compares a budgeted amount with its plan. */
export function summarizePlan(budgeted: Cents, items: readonly PlanItem[]): PlanSummary {
  const planned = planTotal(items);
  const difference = budgeted - planned;
  return {
    planned,
    difference,
    status: difference === 0 ? 'exact' : difference > 0 ? 'buffer' : 'short',
  };
}

/**
 * Cleans plan items for storage: trims labels and drops empty items (no label and no
 * amount). Returns undefined for an empty plan so the field is omitted.
 */
export function normalizePlan(items: readonly PlanItem[]): PlanItem[] | undefined {
  const cleaned = items
    .map((item) => ({ label: item.label.trim(), amount: item.amount }))
    .filter((item) => item.label !== '' || item.amount !== 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

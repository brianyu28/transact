import type { Cents } from '@/lib/money';

export type BudgetStatus = 'ok' | 'ahead' | 'over';

/** Over budget, ahead of the period's pace, or fine. */
export function budgetStatus(budgeted: Cents, spent: Cents, elapsed: number): BudgetStatus {
  if (spent > budgeted) return 'over';
  if (budgeted > 0 && spent / budgeted > elapsed + 0.05) return 'ahead';
  return 'ok';
}

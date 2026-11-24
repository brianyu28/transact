import type { PeriodBounds } from '@/domain/budgets/periods';
import { registerActions } from '@/features/transactions/registerStore';

/** Points the register at what a budget line (or custom budget) counted, optionally in a period. */
export function filterRegisterToBudget(name: string, bounds?: PeriodBounds): void {
  const term = /^[\w-]+$/.test(name) ? `budget:${name}` : `budget:"${name.replace(/"/g, '')}"`;
  registerActions.setQuery(bounds ? `${term} ${bounds.start}..${bounds.end}` : term);
}

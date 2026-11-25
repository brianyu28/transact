import type { PlanSummary } from '@/domain/budgets/plan';
import { useFormat } from '@/hooks/useFormat';

/** "$80.00 buffer", "$80.00 short" or "Exactly covered". */
export function usePlanStatusText() {
  const format = useFormat();
  return (summary: PlanSummary) =>
    summary.status === 'exact'
      ? 'Exactly covered'
      : summary.status === 'buffer'
        ? `${format.money(summary.difference)} buffer`
        : `${format.money(-summary.difference)} short`;
}

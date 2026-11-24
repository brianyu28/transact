import { useMemo } from 'react';
import { incomeVsSpending, monthsBetween } from '@/domain/reports/reports';
import { addMonthsToKey, monthKey, today } from '@/lib/date';
import { useDocStore } from '@/store/docStore';

/** Budget and actual-income figures the planner compares scenarios against. */
export function usePlannerContext(): { budgetPerYear: number; actualIncome: number } {
  const lines = useDocStore((s) => s.doc?.budgets.template.lines);
  const categories = useDocStore((s) => s.doc?.categories);
  const index = useDocStore((s) => s.index);
  const indexVersion = useDocStore((s) => s.indexVersion);
  return useMemo(() => {
    const budgetPerYear = Object.values(lines ?? {}).reduce(
      (s, l) => s + (l.cadence === 'monthly' ? l.defaultAmount * 12 : l.defaultAmount),
      0,
    );
    let actualIncome = 0;
    if (index && categories) {
      // The last 12 complete months.
      const last = addMonthsToKey(monthKey(today()), -1);
      const months = monthsBetween(addMonthsToKey(last, -11), last);
      actualIncome = incomeVsSpending({ categories }, index, months).reduce(
        (s, m) => s + m.income,
        0,
      );
    }
    return { budgetPerYear, actualIncome };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indexVersion tracks in-place index changes.
  }, [lines, categories, index, indexVersion]);
}

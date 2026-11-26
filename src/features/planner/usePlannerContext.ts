import { useMemo } from 'react';
import { incomeVsSpending } from '@/domain/reports/reports';
import { addMonths, endOfMonth, startOfMonth, today } from '@/lib/date';
import { useDocStore } from '@/store/docStore';

/** Budget and actual-income figures the planner compares scenarios against. */
export function usePlannerContext(): { budgetPerYear: number; actualIncome: number } {
  const lines = useDocStore((s) => s.doc?.budgets.template.lines);
  const categories = useDocStore((s) => s.doc?.categories);
  const transactions = useDocStore((s) => s.doc?.transactions);
  const index = useDocStore((s) => s.index);
  const indexVersion = useDocStore((s) => s.indexVersion);
  return useMemo(() => {
    const budgetPerYear = Object.values(lines ?? {}).reduce(
      (s, l) => s + (l.cadence === 'monthly' ? l.defaultAmount * 12 : l.defaultAmount),
      0,
    );
    let actualIncome = 0;
    if (index && categories && transactions) {
      // The last 12 complete months.
      const thisMonth = startOfMonth(today());
      const span = { from: addMonths(thisMonth, -12), to: endOfMonth(addMonths(thisMonth, -1)) };
      actualIncome = incomeVsSpending({ categories, transactions }, index, [span])[0]?.income ?? 0;
    }
    return { budgetPerYear, actualIncome };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indexVersion tracks in-place index changes.
  }, [lines, categories, transactions, index, indexVersion]);
}

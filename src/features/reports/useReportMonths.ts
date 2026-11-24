import { useMemo } from 'react';
import { firstDataDate } from '@/domain/aggregates/balances';
import { resolveRange, type RangeSelection } from '@/domain/aggregates/sampling';
import { monthsBetween } from '@/domain/reports/reports';
import { addMonthsToKey, dateParts, monthKey, today, type MonthKey } from '@/lib/date';
import { useDocStore } from '@/store/docStore';

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Whole months covered by a range selection (reports work month by month). */
export function useReportMonths(range: RangeSelection): MonthKey[] {
  const index = useDocStore((s) => s.index);
  const accounts = useDocStore((s) => s.doc?.accounts);
  const snapshots = useDocStore((s) => s.doc?.balanceSnapshots);
  return useMemo(() => {
    const now = today();
    const current = monthKey(now);
    // Presets are whole months ending with the current one (1Y = exactly 12 months).
    const count = range.key === '3m' ? 3 : range.key === '1y' ? 12 : range.key === '5y' ? 60 : null;
    if (count !== null) return monthsBetween(addMonthsToKey(current, 1 - count), current);
    const first =
      index && accounts && snapshots
        ? firstDataDate({ accounts, balanceSnapshots: snapshots }, index)
        : null;
    const { from, to } = resolveRange(range, now, first);
    return monthsBetween(monthKey(from), monthKey(to));
  }, [range, index, accounts, snapshots]);
}

/** "Nov", or "Jan ’26" at year boundaries and the first column. */
export function shortMonthLabels(months: readonly MonthKey[]): string[] {
  return months.map((m, i) => {
    const { year, month } = dateParts(`${m}-01`);
    const name = SHORT[month - 1] ?? '';
    return month === 1 || i === 0 ? `${name} ’${String(year).slice(2)}` : name;
  });
}

export function longMonthLabel(m: MonthKey): string {
  const { year, month } = dateParts(`${m}-01`);
  return `${LONG[month - 1] ?? ''} ${year}`;
}

/** Categorical series color by slot (1-based); "other" gets the neutral. */
export const seriesColor = (slot: number | 'other') =>
  slot === 'other' ? 'var(--tx-series-other)' : `var(--tx-series-${String(((slot - 1) % 8) + 1)})`;

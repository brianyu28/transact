import { useMemo } from 'react';
import { firstDataDate } from '@/domain/aggregates/balances';
import type { RangeSelection } from '@/domain/aggregates/sampling';
import { isWholeMonths, reportPeriod, type ReportPeriod } from '@/domain/reports/reports';
import {
  dateParts,
  startOfMonth,
  startOfYear,
  today,
  type ISODate,
  type MonthKey,
} from '@/lib/date';
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

/**
 * The span a range selection covers: MTD and YTD run from the start of this month or year
 * to today, "All" from the first month with data to today; a custom range is exact.
 */
export function useReportPeriod(range: RangeSelection): ReportPeriod {
  const index = useDocStore((s) => s.index);
  const accounts = useDocStore((s) => s.doc?.accounts);
  const snapshots = useDocStore((s) => s.doc?.balanceSnapshots);
  return useMemo(() => {
    const now = today();
    if (range.key === 'mtd') return reportPeriod(startOfMonth(now), now);
    if (range.key === 'ytd') return reportPeriod(startOfYear(now), now);
    if (range.key === 'custom')
      return reportPeriod(range.from, range.to < range.from ? range.from : range.to);
    const first =
      index && accounts && snapshots
        ? firstDataDate({ accounts, balanceSnapshots: snapshots }, index)
        : null;
    return reportPeriod(startOfMonth(first ?? now), now);
  }, [range, index, accounts, snapshots]);
}

/** Short column labels: months as "Nov" (with the year at boundaries), days as "Nov 3" / "4". */
export function columnLabels(period: ReportPeriod): string[] {
  if (period.unit === 'month') return shortMonthLabels(period.months);
  return period.columns.map((c, i) => {
    const { month, day } = dateParts(c.from);
    return day === 1 || i === 0 ? `${SHORT[month - 1] ?? ''} ${String(day)}` : String(day);
  });
}

/** Full column titles: "November 2026", a clipped month's dates, or the day. */
export function columnTitles(period: ReportPeriod, formatDate: (d: ISODate) => string): string[] {
  return period.columns.map((c) => {
    if (period.unit === 'day') return formatDate(c.from);
    return isWholeMonths(c) ? longMonthLabel(c.key) : `${formatDate(c.from)} – ${formatDate(c.to)}`;
  });
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

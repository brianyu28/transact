/** Sample dates for charts: fine-grained for short ranges, monthly for long ones. */
import {
  addDays,
  addMonths,
  diffDays,
  endOfMonth,
  maxDate,
  startOfMonth,
  startOfYear,
  type ISODate,
} from '@/lib/date';

export type RangeKey = '1m' | '3m' | '1y' | '5y' | 'mtd' | 'ytd' | 'all' | 'custom';

/** A chart range: a preset, or custom bounds (inclusive). */
export interface RangeSelection {
  key: RangeKey;
  /** Only used when key is 'custom'. */
  from: ISODate;
  to: ISODate;
}

export interface RangeOption {
  value: RangeKey;
  label: string;
}

/** Trailing ranges counted back from today (account trends). */
export const RANGES: readonly RangeOption[] = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '1y', label: '1Y' },
  { value: '5y', label: '5Y' },
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Custom' },
];

/** Calendar periods up to today (reports). */
export const REPORT_RANGES: readonly RangeOption[] = [
  { value: 'mtd', label: 'MTD' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Custom' },
];

/** Concrete [from, to] for a selection, clamped to the data. */
export function resolveRange(
  range: RangeSelection,
  today: ISODate,
  firstDate: ISODate | null,
): { from: ISODate; to: ISODate } {
  const earliest = firstDate ?? today;
  switch (range.key) {
    case '1m':
      return { from: maxDate(addMonths(today, -1), earliest), to: today };
    case '3m':
      return { from: maxDate(addMonths(today, -3), earliest), to: today };
    case '1y':
      return { from: maxDate(addMonths(today, -12), earliest), to: today };
    case '5y':
      return { from: maxDate(addMonths(today, -60), earliest), to: today };
    case 'mtd':
      return { from: maxDate(startOfMonth(today), earliest), to: today };
    case 'ytd':
      return { from: maxDate(startOfYear(today), earliest), to: today };
    case 'all':
      return { from: earliest, to: today };
    case 'custom': {
      const to = range.to < range.from ? range.from : range.to;
      return { from: range.from, to };
    }
  }
}

/**
 * Ascending sample dates covering [from, to], ending exactly at `to`. Granularity follows
 * the span: daily up to ~4 months, weekly up to 2 years, month ends beyond that.
 */
export function sampleBetween(from: ISODate, to: ISODate): ISODate[] {
  const days = diffDays(from, to);
  const out: ISODate[] = [];
  if (days <= 124) {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  } else if (days <= 731) {
    for (let d = to; d >= from; d = addDays(d, -7)) out.push(d);
    out.reverse();
  } else {
    for (let d = endOfMonth(from); d < to; d = endOfMonth(addMonths(d, 1))) out.push(d);
    out.push(to);
  }
  return out;
}

export function sampleDates(
  range: RangeSelection,
  today: ISODate,
  firstDate: ISODate | null,
): ISODate[] {
  const { from, to } = resolveRange(range, today, firstDate);
  return sampleBetween(from, to);
}

/** A preset selection (custom bounds default to the last 6 months). */
export function presetRange(key: RangeKey, today: ISODate): RangeSelection {
  return { key, from: addMonths(today, -6), to: today };
}

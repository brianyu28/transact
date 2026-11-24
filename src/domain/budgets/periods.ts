/**
 * Budget periods. Monthly periods are keyed "YYYY-MM". Annual periods are keyed "YYYY"
 * by the year they start in; with a budget year starting in month M (setting), period
 * "2026" covers 2026-M-01 through the day before 2027-M-01.
 */
import {
  addDays,
  addMonths,
  dateParts,
  diffDays,
  endOfMonth,
  makeDate,
  type ISODate,
} from '@/lib/date';
import type { BudgetTier } from '../schema/types';

export type PeriodKey = string;

export interface PeriodBounds {
  start: ISODate;
  end: ISODate;
}

export function monthlyKey(date: ISODate): PeriodKey {
  return date.slice(0, 7);
}

export function annualKey(date: ISODate, startMonth: number): PeriodKey {
  const { year, month } = dateParts(date);
  return String(month >= startMonth ? year : year - 1);
}

export function periodKeyFor(cadence: BudgetTier, date: ISODate, startMonth: number): PeriodKey {
  return cadence === 'monthly' ? monthlyKey(date) : annualKey(date, startMonth);
}

export function periodBounds(
  cadence: BudgetTier,
  key: PeriodKey,
  startMonth: number,
): PeriodBounds {
  if (cadence === 'monthly') {
    const start = `${key}-01`;
    return { start, end: endOfMonth(start) };
  }
  const start = makeDate(Number(key), startMonth, 1);
  return { start, end: addDays(addMonths(start, 12), -1) };
}

export function shiftPeriod(cadence: BudgetTier, key: PeriodKey, delta: number): PeriodKey {
  if (cadence === 'monthly') return addMonths(`${key}-01`, delta).slice(0, 7);
  return String(Number(key) + delta);
}

/** Fraction of the period elapsed by the end of `today` (0..1). */
export function periodElapsed(bounds: PeriodBounds, today: ISODate): number {
  if (today < bounds.start) return 0;
  if (today >= bounds.end) return 1;
  return (diffDays(bounds.start, today) + 1) / (diffDays(bounds.start, bounds.end) + 1);
}

const MONTH_NAMES = [
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

/** "November 2026", or "2026" (or "2026–27" when the budget year doesn't start in January). */
export function periodLabel(cadence: BudgetTier, key: PeriodKey, startMonth: number): string {
  if (cadence === 'monthly') {
    const { year, month } = dateParts(`${key}-01`);
    return `${MONTH_NAMES[month - 1] ?? ''} ${year}`;
  }
  return startMonth === 1 ? key : `${key}–${String(Number(key) + 1).slice(2)}`;
}

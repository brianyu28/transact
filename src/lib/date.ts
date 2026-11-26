/**
 * Calendar dates are `YYYY-MM-DD` strings: they sort and compare lexically, serialize
 * as-is, and carry no time zone. Arithmetic converts through "epoch days" in UTC so
 * DST and local time zones can never shift a date.
 */
export type ISODate = string;
/** `YYYY-MM` */
export type MonthKey = string;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number) as [number, number, number, number];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in a month (month is 1-12). */
export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const pad4 = (n: number) => String(n).padStart(4, '0');

export function makeDate(year: number, month: number, day: number): ISODate {
  return `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
}

export function dateParts(date: ISODate): { year: number; month: number; day: number } {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

/** Days since 1970-01-01. */
export function toEpochDay(date: ISODate): number {
  const { year, month, day } = dateParts(date);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

export function fromEpochDay(epochDay: number): ISODate {
  const d = new Date(epochDay * MS_PER_DAY);
  return makeDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Today's date in the user's local time zone. */
export function today(now: Date = new Date()): ISODate {
  return makeDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromEpochDay(toEpochDay(date) + days);
}

/** Adds months, clamping the day to the target month's length (Jan 31 + 1 month → Feb 28/29). */
export function addMonths(date: ISODate, months: number): ISODate {
  const { year, month, day } = dateParts(date);
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return makeDate(y, m, Math.min(day, daysInMonth(y, m)));
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: ISODate, b: ISODate): number {
  return toEpochDay(b) - toEpochDay(a);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: ISODate): number {
  return (((toEpochDay(date) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

export function monthKey(date: ISODate): MonthKey {
  return date.slice(0, 7);
}

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

export function startOfYear(date: ISODate): ISODate {
  return `${date.slice(0, 4)}-01-01`;
}

export function endOfMonth(date: ISODate): ISODate {
  const { year, month } = dateParts(date);
  return makeDate(year, month, daysInMonth(year, month));
}

export function addMonthsToKey(key: MonthKey, months: number): MonthKey {
  return monthKey(addMonths(`${key}-01`, months));
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

const displayFormatters = new Map<string, Intl.DateTimeFormat>();

/** Locale-aware display, e.g. "Nov 24, 2026". Formatting is done in UTC to avoid shifts. */
export function formatDate(
  date: ISODate,
  locale = 'en-US',
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
): string {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = displayFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
    displayFormatters.set(key, f);
  }
  return f.format(toEpochDay(date) * MS_PER_DAY);
}

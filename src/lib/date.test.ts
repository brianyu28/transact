import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addMonthsToKey,
  dayOfWeek,
  diffDays,
  endOfMonth,
  formatDate,
  fromEpochDay,
  isISODate,
  toEpochDay,
  today,
} from './date';

describe('date utilities', () => {
  it('validates ISO dates', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('2026-1-01')).toBe(false);
    expect(isISODate(20260101)).toBe(false);
  });

  it('round-trips epoch days', () => {
    expect(toEpochDay('1970-01-01')).toBe(0);
    for (const d of ['1999-12-31', '2024-02-29', '2026-11-24', '2100-03-01']) {
      expect(fromEpochDay(toEpochDay(d))).toBe(d);
    }
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(diffDays('2026-01-01', '2026-12-31')).toBe(364);
  });

  it('adds months with day clamping', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
    expect(addMonthsToKey('2026-12', 1)).toBe('2027-01');
  });

  it('computes day of week and month end', () => {
    expect(dayOfWeek('2026-11-24')).toBe(2); // Tuesday
    expect(dayOfWeek('1969-12-31')).toBe(3); // Wednesday
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
  });

  it('uses local calendar for today', () => {
    expect(today(new Date(2026, 10, 24, 23, 59))).toBe('2026-11-24');
  });

  it('formats without time zone shifts', () => {
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026');
  });
});

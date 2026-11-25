/**
 * Published US tax figures by year. To add a year: copy the latest file (e.g. us2026.ts to
 * us2027.ts), update its figures, and list it below. New scenarios for that year then
 * start from its figures; existing scenarios keep the rules they were created with.
 */
import { US_2026 } from './us2026';
import { US_2027 } from './us2027';
import type { UsTaxYear } from './types';

export type { Brackets, FilingStatus, UsTaxYear } from './types';

/** Oldest first. */
export const US_TAX_YEARS: readonly UsTaxYear[] = [US_2026, US_2027];

/**
 * Figures for `year`: that year's when published, else the latest earlier year (rules for a
 * future year aren't known yet), else the earliest year available.
 */
export function usTaxYearFor(year: number): UsTaxYear {
  let match = US_TAX_YEARS[0] as UsTaxYear;
  for (const y of US_TAX_YEARS) if (y.year <= year) match = y;
  return match;
}

/** The figures for exactly `year`, if published. */
export function usTaxYear(year: number): UsTaxYear | undefined {
  return US_TAX_YEARS.find((y) => y.year === year);
}

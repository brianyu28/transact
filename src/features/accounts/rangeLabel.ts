import type { RangeSelection } from '@/domain/aggregates/sampling';

const PRESET: Record<Exclude<RangeSelection['key'], 'custom'>, string> = {
  '1m': 'over 1 month',
  '3m': 'over 3 months',
  '1y': 'over 1 year',
  '5y': 'over 5 years',
  all: 'over all time',
};

/** "over 1 year", or "Jan 1, 2025 – Mar 31, 2025" for a custom range. */
export function rangeLabel(range: RangeSelection, formatDate: (d: string) => string): string {
  return range.key === 'custom'
    ? `${formatDate(range.from)} – ${formatDate(range.to)}`
    : PRESET[range.key];
}

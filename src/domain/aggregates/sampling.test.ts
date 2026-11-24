import { describe, expect, it } from 'vitest';
import { presetRange, sampleBetween, sampleDates } from './sampling';

const TODAY = '2026-11-24';
const preset = (key: Parameters<typeof presetRange>[0]) => presetRange(key, TODAY);

describe('sampleDates', () => {
  it('samples daily for 3 months and weekly for a year, ending today', () => {
    const daily = sampleDates(preset('3m'), TODAY, '2020-01-01');
    expect(daily[0]).toBe('2026-08-24');
    expect(daily.at(-1)).toBe(TODAY);
    const weekly = sampleDates(preset('1y'), TODAY, '2020-01-01');
    expect(weekly.at(-1)).toBe(TODAY);
    expect(weekly.length).toBe(53);
  });

  it('never starts before the data, and uses month ends for long spans', () => {
    const short = sampleDates(preset('all'), '2026-03-10', '2025-12-15');
    expect(short[0]).toBe('2025-12-15'); // short history: daily
    const long = sampleDates(preset('all'), '2026-03-10', '2016-01-15');
    expect(long.slice(0, 2)).toEqual(['2016-01-31', '2016-02-29']);
    expect(long.at(-1)).toBe('2026-03-10');
    expect(sampleDates(preset('5y'), '2026-03-10', null)).toEqual(['2026-03-10']);
  });

  it('honours custom bounds, ending at the custom end date', () => {
    const custom = { key: 'custom' as const, from: '2025-01-01', to: '2025-03-31' };
    const dates = sampleDates(custom, TODAY, '2020-01-01');
    expect(dates[0]).toBe('2025-01-01');
    expect(dates.at(-1)).toBe('2025-03-31');
    expect(dates).toHaveLength(90);
    // Reversed bounds collapse to a single day rather than failing.
    expect(
      sampleDates({ key: 'custom', from: '2025-05-01', to: '2025-01-01' }, TODAY, null),
    ).toEqual(['2025-05-01']);
  });

  it('picks granularity from the span', () => {
    expect(sampleBetween('2024-01-01', '2025-06-30').length).toBeLessThan(80); // weekly
    expect(sampleBetween('2015-01-01', '2025-01-01').length).toBeLessThan(125); // monthly
  });
});

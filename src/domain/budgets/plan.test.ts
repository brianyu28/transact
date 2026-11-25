import { describe, expect, it } from 'vitest';
import { normalizePlan, planTotal, summarizePlan } from './plan';

const items = [
  { label: 'Car', amount: 90000 },
  { label: 'Renters', amount: 20000 },
];

describe('budget line plans', () => {
  it('totals items, treating a missing plan as zero', () => {
    expect(planTotal(items)).toBe(110000);
    expect(planTotal(undefined)).toBe(0);
  });

  it('reports an exact match, a buffer or a shortfall', () => {
    expect(summarizePlan(110000, items)).toEqual({
      planned: 110000,
      difference: 0,
      status: 'exact',
    });
    expect(summarizePlan(120000, items)).toMatchObject({ difference: 10000, status: 'buffer' });
    expect(summarizePlan(100000, items)).toMatchObject({ difference: -10000, status: 'short' });
  });

  it('trims labels, drops empty items and omits an empty plan', () => {
    expect(
      normalizePlan([
        { label: '  Car ', amount: 90000 },
        { label: ' ', amount: 0 },
        { label: '', amount: 500 },
      ]),
    ).toEqual([
      { label: 'Car', amount: 90000 },
      { label: '', amount: 500 },
    ]);
    expect(normalizePlan([{ label: '', amount: 0 }])).toBeUndefined();
  });
});

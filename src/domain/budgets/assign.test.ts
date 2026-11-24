import { describe, expect, it } from 'vitest';
import { categoryTree } from '../aggregates/lookups';
import type { Category, CustomBudget, FileSettings } from '../schema/types';
import { DEFAULT_SETTINGS } from '../schema/defaults';
import type { EffectiveSplit } from '../transactions/splits';
import { createAssigner, type LineSpec, type TierLines } from './assign';

const T = '2026-01-01T00:00:00.000Z';
const cat = (id: string, parentId: string | null, kind?: 'income'): Category => ({
  id: `cat_${id}`,
  name: id,
  parentId: parentId ? `cat_${parentId}` : null,
  order: 0,
  updatedAt: T,
  ...(kind ? { kind } : {}),
});
const categories = Object.fromEntries(
  [
    cat('bills', null),
    cat('cell', 'bills'),
    cat('internet', 'bills'),
    cat('food', null),
    cat('groceries', 'food'),
    cat('travel', null),
    cat('income', null, 'income'),
    cat('salary', 'income'),
  ].map((c) => [c.id, c]),
);
const tree = categoryTree(categories);

const line = (lineId: string, ...cats: string[]): LineSpec => ({
  lineId,
  target: cats.length
    ? { kind: 'categories', categoryIds: cats.map((c) => `cat_${c}`) }
    : { kind: 'everythingElse' },
});

const baseLines: TierLines = {
  monthly: [line('m-bills', 'bills'), line('m-food', 'food'), line('m-ee')],
  annual: [line('a-cell', 'cell'), line('a-ee')],
};

const trip: CustomBudget = {
  id: 'cbd_trip',
  name: 'Trip',
  match: { tags: ['tag_trip'], mode: 'any' },
  dateRange: { start: '2026-06-01', end: '2026-06-30' },
  lines: [
    {
      id: 'trip-food',
      name: 'Food',
      target: { kind: 'categories', categoryIds: ['cat_food'] },
      amount: 50000,
    },
  ],
  priority: 0,
  updatedAt: T,
};

function assigner(
  overrides: {
    lines?: TierLines;
    custom?: CustomBudget[];
    settings?: Partial<FileSettings['budget']>;
  } = {},
) {
  return createAssigner({
    tree,
    settings: { ...DEFAULT_SETTINGS.budget, ...overrides.settings },
    lines: overrides.lines ?? baseLines,
    custom: overrides.custom ?? [trip],
  });
}

const split = (
  categoryId: string | undefined,
  extra: Partial<EffectiveSplit> = {},
): EffectiveSplit => ({
  id: 'spl_x',
  amount: -1000,
  categoryId: categoryId ? `cat_${categoryId}` : undefined,
  tags: [],
  excluded: false,
  ...extra,
});

const JAN = '2026-01-15';

describe('budget assignment', () => {
  it('prefers the most specific category across tiers', () => {
    expect(assigner().assign(split('cell'), JAN)).toEqual({
      kind: 'line',
      cadence: 'annual',
      lineId: 'a-cell',
    });
    expect(assigner().assign(split('internet'), JAN)).toEqual({
      kind: 'line',
      cadence: 'monthly',
      lineId: 'm-bills',
    });
    expect(assigner().assign(split('groceries'), JAN)).toMatchObject({ lineId: 'm-food' });
  });

  it('breaks ties between tiers with the tier order setting', () => {
    const lines: TierLines = {
      monthly: [line('m-cell', 'cell')],
      annual: [line('a-cell', 'cell')],
    };
    expect(assigner({ lines }).assign(split('cell'), JAN)).toMatchObject({ lineId: 'm-cell' });
    expect(
      assigner({ lines, settings: { tierOrder: ['annual', 'monthly'] } }).assign(
        split('cell'),
        JAN,
      ),
    ).toMatchObject({
      lineId: 'a-cell',
    });
  });

  it('falls back to Everything Else, honouring the preferred tier', () => {
    expect(assigner().assign(split('travel'), JAN)).toEqual({
      kind: 'line',
      cadence: 'monthly',
      lineId: 'm-ee',
    });
    expect(
      assigner({ settings: { everythingElseTier: 'annual' } }).assign(split('travel'), JAN),
    ).toMatchObject({
      lineId: 'a-ee',
    });
    const onlyAnnualEE: TierLines = { monthly: [line('m-food', 'food')], annual: [line('a-ee')] };
    expect(assigner({ lines: onlyAnnualEE }).assign(split('travel'), JAN)).toMatchObject({
      lineId: 'a-ee',
    });
  });

  it('handles uncategorized spending per the setting', () => {
    expect(assigner().assign(split(undefined), JAN)).toMatchObject({ lineId: 'm-ee' });
    expect(
      assigner({ settings: { uncategorizedToEverythingElse: false } }).assign(
        split(undefined),
        JAN,
      ),
    ).toEqual({
      kind: 'unbudgeted',
    });
  });

  it('reports spending no line covers as unbudgeted', () => {
    const lines: TierLines = { monthly: [line('m-food', 'food')], annual: [] };
    expect(assigner({ lines }).assign(split('travel'), JAN)).toEqual({ kind: 'unbudgeted' });
  });

  it('ignores excluded splits and income', () => {
    expect(assigner().assign(split('groceries', { excluded: true }), JAN)).toBeNull();
    expect(assigner().assign(split('salary', { amount: 500000 }), JAN)).toBeNull();
  });

  it('sends tagged spending to custom budgets within their date range', () => {
    const tagged = (c: string) => split(c, { tags: ['tag_trip'] });
    expect(assigner().assign(tagged('groceries'), '2026-06-10')).toEqual({
      kind: 'custom',
      budgetId: 'cbd_trip',
      lineId: 'trip-food',
    });
    expect(assigner().assign(tagged('travel'), '2026-06-10')).toEqual({
      kind: 'custom',
      budgetId: 'cbd_trip',
      lineId: null,
    });
    // Outside the date range it's ordinary spending.
    expect(assigner().assign(tagged('groceries'), '2026-07-01')).toMatchObject({
      lineId: 'm-food',
    });
  });

  it('supports "all tags" matching and priority between custom budgets', () => {
    const both: CustomBudget = {
      id: 'cbd_both',
      name: 'Work trip',
      match: { tags: ['tag_trip', 'tag_work'], mode: 'all' },
      lines: trip.lines,
      priority: -1,
      updatedAt: T,
    };
    const a = assigner({ custom: [trip, both] });
    expect(a.assign(split('food', { tags: ['tag_trip'] }), '2026-06-10')).toMatchObject({
      budgetId: 'cbd_trip',
    });
    expect(a.assign(split('food', { tags: ['tag_trip', 'tag_work'] }), '2026-06-10')).toMatchObject(
      { budgetId: 'cbd_both' },
    );
  });
});

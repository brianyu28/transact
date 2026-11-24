/** Factory for new, empty documents (with a starter category tree). */
import { newId, type IdKind } from '@/lib/id';
import type { DocModel } from '../model';
import type { Category, FileSettings } from './types';

export const DEFAULT_SETTINGS: FileSettings = {
  currency: 'USD',
  locale: 'en-US',
  weekStartsOn: 0,
  budgetYearStartMonth: 1,
  budget: {
    tierOrder: ['monthly', 'annual'],
    everythingElseTier: 'monthly',
    uncategorizedToEverythingElse: true,
    defaultRolloverPolicy: 'prompt',
  },
  reconcileGraceDays: 7,
};

/** Generic starter categories. Top-level "Income" is the only income-kind root. */
export const STARTER_CATEGORIES: readonly (readonly [string, readonly string[], 'income'?])[] = [
  ['Income', ['Salary', 'Bonus', 'Interest', 'Dividends', 'Other Income'], 'income'],
  ['Housing', ['Rent & Mortgage', 'Utilities', 'Maintenance']],
  ['Bills', ['Cell Service', 'Internet', 'Subscriptions', 'Insurance']],
  ['Food', ['Groceries', 'Restaurants', 'Coffee']],
  ['Transportation', ['Gas', 'Public Transit', 'Parking', 'Rideshare']],
  ['Shopping', ['Clothing', 'Household', 'Electronics']],
  ['Health', ['Medical', 'Pharmacy', 'Fitness']],
  ['Personal', ['Personal Care', 'Education', 'Gifts', 'Charity']],
  ['Entertainment', []],
  ['Travel', ['Flights', 'Lodging']],
  ['Fees & Interest', []],
  ['Taxes', []],
];

export function starterCategories(
  now: string,
  makeId: (kind: IdKind) => string = newId,
): Category[] {
  const out: Category[] = [];
  STARTER_CATEGORIES.forEach(([name, children, kind], i) => {
    const parent: Category = {
      id: makeId('category'),
      name,
      parentId: null,
      order: i,
      updatedAt: now,
    };
    if (kind) parent.kind = kind;
    out.push(parent);
    children.forEach((child, j) => {
      out.push({
        id: makeId('category'),
        name: child,
        parentId: parent.id,
        order: j,
        updatedAt: now,
      });
    });
  });
  return out;
}

export interface NewDocumentOptions {
  appVersion: string;
  now?: string;
  starterCategories?: boolean;
}

export function createEmptyDocument(options: NewDocumentOptions): DocModel {
  const now = options.now ?? new Date().toISOString();
  const categories = options.starterCategories === false ? [] : starterCategories(now);
  return {
    meta: {
      fileId: newId('file'),
      revision: 0,
      createdAt: now,
      savedAt: null,
      savedBy: null,
      appVersion: options.appVersion,
    },
    settings: structuredClone(DEFAULT_SETTINGS),
    accounts: {},
    categories: Object.fromEntries(categories.map((c) => [c.id, c])),
    tags: {},
    transactions: {},
    balanceSnapshots: {},
    statements: {},
    budgets: { template: { lines: {}, updatedAt: now }, periods: {}, custom: {} },
    planner: { scenarios: {} },
    tombstones: [],
  };
}

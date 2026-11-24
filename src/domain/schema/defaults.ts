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

/** A category tree: [name, child names, kind]. Only top-level categories carry a kind. */
export type CategoryTreeSpec = readonly (readonly [string, readonly string[], 'income'?])[];

/**
 * Categories in a new file: deliberately short and flat, so people add the detail they want.
 * "Income" is the only income-kind root.
 */
export const STARTER_CATEGORIES: CategoryTreeSpec = [
  ['Income', ['Salary', 'Other'], 'income'],
  ['Bills', []],
  ['Groceries', []],
  ['Dining', []],
  ['Transportation', []],
  ['Shopping', []],
  ['Entertainment', []],
  ['Travel', []],
];

export function starterCategories(
  now: string,
  makeId: (kind: IdKind) => string = newId,
  tree: CategoryTreeSpec = STARTER_CATEGORIES,
): Category[] {
  const out: Category[] = [];
  tree.forEach(([name, children, kind], i) => {
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

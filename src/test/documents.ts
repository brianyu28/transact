import type { DocModel } from '@/domain/model';
import { createEmptyDocument, starterCategories } from '@/domain/schema/defaults';

/**
 * An empty document with a nested category tree, for tests that need subcategories
 * (new files start with a flat list).
 */
export function testDocument(): DocModel {
  const empty = createEmptyDocument({ appVersion: 'test', starterCategories: false });
  const categories = starterCategories(empty.meta.createdAt, undefined, [
    ['Income', ['Salary'], 'income'],
    ['Housing', []],
    ['Bills', ['Cell Service', 'Internet', 'Insurance']],
    ['Food', ['Groceries', 'Restaurants', 'Coffee']],
    ['Shopping', ['Clothing', 'Household']],
    ['Entertainment', []],
    ['Travel', ['Flights', 'Lodging']],
  ]);
  return { ...empty, categories: Object.fromEntries(categories.map((c) => [c.id, c])) };
}

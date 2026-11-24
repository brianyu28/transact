/**
 * Derived lookups used by editors and pickers. Each is memoized on the identity of the
 * collection it reads (Immer gives a new object only when something in it changed).
 */
import {
  iterateTransactions,
  type DocModel,
  type EntityMap,
  type TransactionBuckets,
} from '../model';
import type { Category, CategoryKind, Id, ISODate } from '../schema/types';
import { effectiveSplits } from '../transactions/splits';

function memo<K extends object, V>(compute: (key: K) => V): (key: K) => V {
  const cache = new WeakMap<K, V>();
  return (key) => {
    let value = cache.get(key);
    if (value === undefined) {
      value = compute(key);
      cache.set(key, value);
    }
    return value;
  };
}

export interface CategoryNode {
  category: Category;
  depth: number;
  /** Ancestor names joined, e.g. "Food › Groceries". */
  path: string;
  /** Effective kind (inherited from the top-level ancestor). */
  kind: CategoryKind;
  /** Ids of this category and all its descendants. */
  subtree: readonly Id[];
}

export interface CategoryTree {
  /** Depth-first, in display order. */
  nodes: readonly CategoryNode[];
  byId: ReadonlyMap<Id, CategoryNode>;
}

export const categoryTree = memo((categories: EntityMap<Category>): CategoryTree => {
  const children = new Map<Id | null, Category[]>();
  for (const c of Object.values(categories)) {
    const parent = c.parentId !== null && c.parentId in categories ? c.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(c);
    children.set(parent, list);
  }
  for (const list of children.values())
    list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const nodes: CategoryNode[] = [];
  const byId = new Map<Id, CategoryNode>();
  const visit = (
    parent: Id | null,
    depth: number,
    prefix: string,
    kind: CategoryKind | undefined,
  ): Id[] => {
    const ids: Id[] = [];
    for (const category of children.get(parent) ?? []) {
      const path = prefix ? `${prefix} › ${category.name}` : category.name;
      const effectiveKind = kind ?? category.kind ?? 'expense';
      const node: CategoryNode = { category, depth, path, kind: effectiveKind, subtree: [] };
      nodes.push(node);
      byId.set(category.id, node);
      const descendants = visit(category.id, depth + 1, path, effectiveKind);
      node.subtree = [category.id, ...descendants];
      ids.push(...node.subtree);
    }
    return ids;
  };
  visit(null, 0, '', undefined);
  return { nodes, byId };
});

export interface PayeeInfo {
  name: string;
  count: number;
  lastDate: ISODate;
  /** Category of the most recent transaction with this payee (for auto-fill). */
  lastCategoryId: Id | undefined;
  lastAccountId: Id;
}

/** Payees by lower-cased name, most used first when listed. */
export const payeeIndex = memo(
  (transactions: TransactionBuckets): ReadonlyMap<string, PayeeInfo> => {
    const map = new Map<string, PayeeInfo>();
    for (const t of iterateTransactions({ transactions })) {
      if (!t.payee || t.transfer) continue;
      const key = t.payee.toLowerCase();
      const info = map.get(key);
      if (!info) {
        map.set(key, {
          name: t.payee,
          count: 1,
          lastDate: t.date,
          lastCategoryId: t.categoryId,
          lastAccountId: t.accountId,
        });
      } else {
        info.count++;
        if (t.date >= info.lastDate) {
          info.lastDate = t.date;
          info.name = t.payee;
          info.lastAccountId = t.accountId;
          if (!t.splits) info.lastCategoryId = t.categoryId;
        }
      }
    }
    return new Map([...map].sort(([, a], [, b]) => b.count - a.count));
  },
);

export interface Usage {
  categories: ReadonlyMap<Id, number>;
  tags: ReadonlyMap<Id, number>;
  accounts: ReadonlyMap<Id, number>;
}

/** How many transactions use each category, tag and account. */
export const usageCounts = memo((transactions: TransactionBuckets): Usage => {
  const categories = new Map<Id, number>();
  const tags = new Map<Id, number>();
  const accounts = new Map<Id, number>();
  const bump = (map: Map<Id, number>, id: Id) => map.set(id, (map.get(id) ?? 0) + 1);
  for (const t of iterateTransactions({ transactions })) {
    bump(accounts, t.accountId);
    const seenTags = new Set<Id>();
    for (const s of effectiveSplits(t)) {
      if (s.categoryId) bump(categories, s.categoryId);
      for (const tag of s.tags) seenTags.add(tag);
    }
    for (const tag of seenTags) bump(tags, tag);
  }
  return { categories, tags, accounts };
});

export function sortedAccounts(doc: Pick<DocModel, 'accounts'>) {
  return Object.values(doc.accounts).sort((a, b) => a.order - b.order);
}

export function sortedTags(doc: Pick<DocModel, 'tags'>) {
  return Object.values(doc.tags).sort((a, b) => a.name.localeCompare(b.name));
}

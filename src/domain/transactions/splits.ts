/**
 * Splits are optional: most transactions carry a single `categoryId` directly, and only
 * split transactions have a `splits` array. Everything that aggregates by category
 * (budgets, reports, filters) reads transactions through `effectiveSplits`, so no
 * feature ever has to handle the two shapes separately.
 */
import type { Cents, Id, Transaction } from '../schema/types';

export interface EffectiveSplit {
  /** The split id, or the transaction id for an unsplit transaction. */
  id: Id;
  amount: Cents;
  categoryId: Id | undefined;
  /** Transaction tags ∪ split tags. */
  tags: readonly Id[];
  excluded: boolean;
}

const EMPTY: readonly Id[] = Object.freeze([]);
// Transactions are immutable (Immer), so results can be cached per object identity.
const cache = new WeakMap<Transaction, readonly EffectiveSplit[]>();

export function effectiveSplits(t: Transaction): readonly EffectiveSplit[] {
  let result = cache.get(t);
  if (result) return result;
  const txnTags = t.tags ?? EMPTY;
  const txnExcluded = t.excluded === true;
  if (!t.splits) {
    result = [
      {
        id: t.id,
        amount: t.amount,
        categoryId: t.categoryId,
        tags: txnTags,
        excluded: txnExcluded,
      },
    ];
  } else {
    result = t.splits.map((s) => ({
      id: s.id,
      amount: s.amount,
      categoryId: s.categoryId,
      tags: s.tags ? [...new Set([...txnTags, ...s.tags])] : txnTags,
      excluded: txnExcluded || s.excluded === true,
    }));
  }
  cache.set(t, result);
  return result;
}

export function isSplit(t: Transaction): boolean {
  return t.splits !== undefined;
}

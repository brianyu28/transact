/** Display labels for register rows, computed from lookups (no React). */
import { categoryTree } from '@/domain/aggregates/lookups';
import { getTransaction, type DocModel } from '@/domain/model';
import type { Transaction } from '@/domain/schema/types';

export interface RowLabels {
  account: string;
  category: string;
  /** "transfer" | "split" | "uncategorized" | "category" for styling. */
  categoryKind: 'transfer' | 'split' | 'uncategorized' | 'category';
  tags: string[];
}

// Labels are cached per transaction object (immutable) and dropped whenever the
// accounts, categories or tags they're derived from change.
let cache = new WeakMap<Transaction, RowLabels>();
let cachedFrom: readonly unknown[] = [];

export function rowLabels(t: Transaction, doc: DocModel): RowLabels {
  const from = [doc.accounts, doc.categories, doc.tags];
  if (from.some((x, i) => x !== cachedFrom[i])) {
    cache = new WeakMap();
    cachedFrom = from;
  }
  let labels = cache.get(t);
  if (!labels) {
    labels = computeLabels(t, doc);
    cache.set(t, labels);
  }
  return labels;
}

function computeLabels(t: Transaction, doc: DocModel): RowLabels {
  const tree = categoryTree(doc.categories);
  let category: string;
  let categoryKind: RowLabels['categoryKind'];
  if (t.transfer) {
    const peer = getTransaction(doc, t.transfer.peerId);
    category = `${t.amount < 0 ? '→' : '←'} ${peer ? (doc.accounts[peer.accountId]?.name ?? 'Unknown') : 'Unknown'}`;
    categoryKind = 'transfer';
  } else if (t.splits) {
    category = `Split (${t.splits.length})`;
    categoryKind = 'split';
  } else if (t.categoryId) {
    const node = tree.byId.get(t.categoryId);
    category = node?.path ?? 'Unknown';
    categoryKind = 'category';
  } else {
    category = 'Uncategorized';
    categoryKind = 'uncategorized';
  }
  return {
    account: doc.accounts[t.accountId]?.name ?? 'Unknown',
    category,
    categoryKind,
    tags: (t.tags ?? []).map((id) => doc.tags[id]?.name ?? '?'),
  };
}

/**
 * In-memory indexes and rollups over transactions, kept up to date incrementally.
 * A full build is O(n log n) and runs once on load; each edit then costs O(log n)
 * (plus an array splice), so the UI never re-scans all transactions after a change.
 *
 * The index is mutable for speed. Consumers observe `version` (and the per-structure
 * versions) to know when derived views need recomputing.
 */
import { monthKey, type ISODate, type MonthKey } from '@/lib/date';
import { iterateTransactions, type DocModel } from '../model';
import type { Cents, Id, Transaction } from '../schema/types';
import { effectiveSplits } from '../transactions/splits';

/** Rollup key used for splits without a category. */
export const UNCATEGORIZED = '';

/** Sort key: date then id, so ordering is stable and keys compare as plain strings. */
const sortKey = (t: Transaction) => `${t.date}|${t.id}`;
const ID_OFFSET = 'YYYY-MM-DD|'.length;
export const idFromKey = (key: string): Id => key.slice(ID_OFFSET);

/** Index of the first element >= key in a sorted string array. */
function lowerBound(arr: readonly string[], key: string): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((arr[mid] as string) < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function insertSorted(arr: string[], key: string): void {
  arr.splice(lowerBound(arr, key), 0, key);
}

function removeSorted(arr: string[], key: string): void {
  const i = lowerBound(arr, key);
  if (arr[i] === key) arr.splice(i, 1);
}

function addTo<K>(map: Map<K, Cents>, key: K, delta: Cents): void {
  const next = (map.get(key) ?? 0) + delta;
  if (next === 0) map.delete(key);
  else map.set(key, next);
}

export class DocIndex {
  /** All transactions as sorted `date|id` keys. */
  readonly byDate: string[] = [];
  /** Per account, sorted `date|id` keys. */
  readonly byAccount = new Map<Id, string[]>();
  /** month → categoryId (or UNCATEGORIZED) → net amount, excluding transfers and excluded splits. */
  readonly categoryByMonth = new Map<MonthKey, Map<Id, Cents>>();
  /** account → date → net change on that day (all transactions, including transfers). */
  readonly accountDailyDelta = new Map<Id, Map<ISODate, Cents>>();
  /** Incremented on every change. */
  version = 0;
  /** Per-account change counters (for caching balance series). */
  readonly accountVersions = new Map<Id, number>();

  static build(doc: DocModel): DocIndex {
    const index = new DocIndex();
    for (const t of iterateTransactions(doc)) index.add(t, false);
    index.byDate.sort();
    for (const keys of index.byAccount.values()) keys.sort();
    return index;
  }

  /** Applies a change to one transaction (`prev` absent = created, `next` absent = deleted). */
  update(prev: Transaction | undefined, next: Transaction | undefined): void {
    if (prev === next) return;
    if (prev) this.remove(prev);
    if (next) this.add(next, true);
    this.version++;
  }

  /** Transaction ids in [from, to] (inclusive, ISO dates), in date order. */
  idsInRange(from: ISODate, to: ISODate, accountId?: Id): Id[] {
    const keys = accountId ? (this.byAccount.get(accountId) ?? []) : this.byDate;
    const start = lowerBound(keys, `${from}|`);
    const end = lowerBound(keys, `${to}|￿`);
    const out: Id[] = [];
    for (let i = start; i < end; i++) out.push(idFromKey(keys[i] as string));
    return out;
  }

  private add(t: Transaction, sorted: boolean): void {
    const key = sortKey(t);
    let accountKeys = this.byAccount.get(t.accountId);
    if (!accountKeys) {
      accountKeys = [];
      this.byAccount.set(t.accountId, accountKeys);
    }
    if (sorted) {
      insertSorted(this.byDate, key);
      insertSorted(accountKeys, key);
    } else {
      this.byDate.push(key);
      accountKeys.push(key);
    }
    this.applyAmounts(t, 1);
  }

  private remove(t: Transaction): void {
    const key = sortKey(t);
    removeSorted(this.byDate, key);
    const accountKeys = this.byAccount.get(t.accountId);
    if (accountKeys) removeSorted(accountKeys, key);
    this.applyAmounts(t, -1);
  }

  private applyAmounts(t: Transaction, sign: 1 | -1): void {
    let daily = this.accountDailyDelta.get(t.accountId);
    if (!daily) {
      daily = new Map();
      this.accountDailyDelta.set(t.accountId, daily);
    }
    addTo(daily, t.date, sign * t.amount);
    this.accountVersions.set(t.accountId, (this.accountVersions.get(t.accountId) ?? 0) + 1);

    if (t.transfer) return;
    const month = monthKey(t.date);
    let byCategory = this.categoryByMonth.get(month);
    if (!byCategory) {
      byCategory = new Map();
      this.categoryByMonth.set(month, byCategory);
    }
    for (const split of effectiveSplits(t)) {
      if (!split.excluded)
        addTo(byCategory, split.categoryId ?? UNCATEGORIZED, sign * split.amount);
    }
  }
}

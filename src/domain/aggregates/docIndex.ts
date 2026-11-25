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

/** Payees repeat a lot, so their reversed text is cached (and the cache bounded). */
const descendingCache = new Map<string, string>();

/** Payee text reversed for string order (Z…A), so a reversed list reads A–Z. */
function descendingText(text: string): string {
  let out = descendingCache.get(text);
  if (out !== undefined) return out;
  if (descendingCache.size >= 50_000) descendingCache.clear();
  out = reverseText(text);
  descendingCache.set(text, out);
  return out;
}

function reverseText(payee: string): string {
  const text = payee.toLowerCase();
  // Latin-1 text maps into Latin-1 so keys stay one-byte strings, which sort much faster;
  // other scripts use the full range (their order relative to Latin names may differ).
  let max = 0;
  for (let i = 0; i < text.length; i++) max = Math.max(max, text.charCodeAt(i));
  const top = max < 0xff ? 0xff : 0xffff;
  let out = '';
  for (let i = 0; i < text.length; i++) out += String.fromCharCode(top - 1 - text.charCodeAt(i));
  // Sorts a name after the longer names it begins ("Ab" after "Abc"), so A–Z when reversed.
  return out + String.fromCharCode(top);
}

/** `createdAt` as a UTC `toISOString()` string, which sorts as text in time order. */
function utcTimestamp(value: string): string {
  // The app writes this form; others (offsets, no milliseconds) are converted.
  if (value.length === 24 && value.endsWith('Z')) return value;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? '0000-00-00T00:00:00.000Z' : new Date(ms).toISOString();
}

// Above any real amount, so the amount part is never negative (amounts are safe integers).
const AMOUNT_OFFSET = 2 ** 53;

/**
 * Sort key: `date|rank|id`, compared as plain strings. Lists show transactions newest
 * first, which is this order reversed, so within a day the rank puts them in this order
 * when reversed: most recently entered first, then payee A–Z, then amount (low to high),
 * then id so the order never ties.
 */
export function sortKey(t: Transaction): string {
  const createdPart = utcTimestamp(t.createdAt);
  const amountPart = String(AMOUNT_OFFSET - t.amount).padStart(17, '0');
  return `${t.date}|${createdPart}${descendingText(t.payee)}${amountPart}|${t.id}`;
}

/** The transaction id at the end of a sort key. */
export const idFromKey = (key: string): Id => key.slice(key.lastIndexOf('|') + 1);

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
  /** All transactions as sorted keys (see `sortKey`). */
  readonly byDate: string[] = [];
  /** Per account, sorted keys (see `sortKey`). */
  readonly byAccount = new Map<Id, string[]>();
  /** month → categoryId (or UNCATEGORIZED) → net amount, excluding transfers and excluded splits. */
  readonly categoryByMonth = new Map<MonthKey, Map<Id, Cents>>();
  /** Same shape as `categoryByMonth`, for excluded splits only (transfers still left out). */
  readonly excludedByMonth = new Map<MonthKey, Map<Id, Cents>>();
  /** account → date → net change on that day (all transactions, including transfers). */
  readonly accountDailyDelta = new Map<Id, Map<ISODate, Cents>>();
  /** Per account, sort keys of transactions not yet reconciled (for statements). */
  readonly unreconciled = new Map<Id, Set<string>>();
  /** Per statement, sort keys of its transactions. */
  readonly byStatement = new Map<Id, Set<string>>();
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
    if (t.statementId) {
      let members = this.byStatement.get(t.statementId);
      if (!members) {
        members = new Set();
        this.byStatement.set(t.statementId, members);
      }
      members.add(key);
    }
    if (!t.reconciled) {
      let set = this.unreconciled.get(t.accountId);
      if (!set) {
        set = new Set();
        this.unreconciled.set(t.accountId, set);
      }
      set.add(key);
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
    this.unreconciled.get(t.accountId)?.delete(key);
    if (t.statementId) this.byStatement.get(t.statementId)?.delete(key);
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
    for (const split of effectiveSplits(t)) {
      const target = split.excluded ? this.excludedByMonth : this.categoryByMonth;
      let byCategory = target.get(month);
      if (!byCategory) {
        byCategory = new Map();
        target.set(month, byCategory);
      }
      addTo(byCategory, split.categoryId ?? UNCATEGORIZED, sign * split.amount);
    }
  }
}

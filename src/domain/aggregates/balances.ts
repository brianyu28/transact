/**
 * Account balances over time.
 *
 * A balance snapshot means "at the start of `date`, the balance is `balance`" (before that
 * day's transactions). Between snapshots, balances follow the transactions. For each
 * account we keep its daily net changes sorted by date with prefix sums, so the balance on
 * any date is a binary search: O(log n).
 *
 * Where a snapshot disagrees with the balance implied by the previous snapshot plus the
 * transactions in between, the difference is an "adjustment": market change for an
 * investment account, or an unexplained discrepancy for a bank or card account.
 */
import { addDays, type ISODate } from '@/lib/date';
import { getTransaction, type DocModel } from '../model';
import {
  LIABILITY_ACCOUNT_TYPES,
  type Account,
  type BalanceSnapshot,
  type Cents,
  type Id,
} from '../schema/types';
import type { DocIndex } from './docIndex';

export interface Anchor {
  snapshot: BalanceSnapshot;
  /** Balance the transactions alone imply at this date (from the previous anchor). */
  implied: Cents;
  /** snapshot.balance − implied. */
  adjustment: Cents;
}

export interface AccountLedger {
  accountId: Id;
  /** Dates with a non-zero net change, ascending. */
  dates: readonly ISODate[];
  /** cumulative[i] = sum of changes on dates[0..i]. */
  cumulative: readonly Cents[];
  /** Snapshots ascending by date, with how they compare to the transactions. */
  anchors: readonly Anchor[];
  /** Earliest date with any data (transaction or snapshot), if any. */
  firstDate: ISODate | null;
}

/** Index of the first element >= value. */
function lowerBound(arr: readonly string[], value: string): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((arr[mid] as string) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Sum of changes strictly before `date`. */
function sumBefore(ledger: Pick<AccountLedger, 'dates' | 'cumulative'>, date: ISODate): Cents {
  const i = lowerBound(ledger.dates, date) - 1;
  return i >= 0 ? (ledger.cumulative[i] as Cents) : 0;
}

export function buildLedger(
  accountId: Id,
  dailyDelta: ReadonlyMap<ISODate, Cents> | undefined,
  snapshots: readonly BalanceSnapshot[],
): AccountLedger {
  const dates = dailyDelta ? [...dailyDelta.keys()].sort() : [];
  const cumulative: Cents[] = new Array<Cents>(dates.length);
  let running = 0;
  for (let i = 0; i < dates.length; i++) {
    running += dailyDelta?.get(dates[i] as ISODate) ?? 0;
    cumulative[i] = running;
  }
  const base = { dates, cumulative };

  const sorted = [...snapshots].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1,
  );
  const anchors: Anchor[] = [];
  let prev: BalanceSnapshot | undefined;
  for (const snapshot of sorted) {
    // The first snapshot defines the opening balance, so it has no adjustment.
    const implied = prev
      ? prev.balance + sumBefore(base, snapshot.date) - sumBefore(base, prev.date)
      : snapshot.balance;
    anchors.push({ snapshot, implied, adjustment: snapshot.balance - implied });
    prev = snapshot;
  }

  const firstTxn = dates[0];
  const firstSnap = sorted[0]?.date;
  const firstDate =
    firstTxn && firstSnap
      ? firstTxn < firstSnap
        ? firstTxn
        : firstSnap
      : (firstTxn ?? firstSnap ?? null);
  return { accountId, dates, cumulative, anchors, firstDate };
}

/** Last anchor on or before `date`. */
function anchorAt(ledger: AccountLedger, date: ISODate): Anchor | undefined {
  let lo = 0;
  let hi = ledger.anchors.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((ledger.anchors[mid] as Anchor).snapshot.date <= date) lo = mid + 1;
    else hi = mid;
  }
  return ledger.anchors[lo - 1];
}

/**
 * Balance at the start of `date` (before that day's transactions). Before the first
 * snapshot, balances are derived backwards from it.
 */
export function balanceAtStart(ledger: AccountLedger, date: ISODate): Cents {
  const anchor = anchorAt(ledger, date) ?? ledger.anchors[0];
  const before = sumBefore(ledger, date);
  return anchor
    ? anchor.snapshot.balance + before - sumBefore(ledger, anchor.snapshot.date)
    : before;
}

/** Balance at the end of `date` (after that day's transactions). */
export function balanceAtEnd(ledger: AccountLedger, date: ISODate): Cents {
  return balanceAtStart(ledger, addDays(date, 1));
}

// ── Cached access ────────────────────────────────────────────────────────────

interface CacheEntry {
  version: number;
  snapshots: DocModel['balanceSnapshots'];
  ledger: AccountLedger;
}
const caches = new WeakMap<DocIndex, Map<Id, CacheEntry>>();

/** The account's ledger, rebuilt only when its transactions or the snapshots change. */
export function getLedger(
  doc: Pick<DocModel, 'balanceSnapshots'>,
  index: DocIndex,
  accountId: Id,
): AccountLedger {
  let cache = caches.get(index);
  if (!cache) {
    cache = new Map();
    caches.set(index, cache);
  }
  const version = index.accountVersions.get(accountId) ?? 0;
  const hit = cache.get(accountId);
  if (hit && hit.version === version && hit.snapshots === doc.balanceSnapshots) return hit.ledger;
  const snapshots = Object.values(doc.balanceSnapshots).filter((s) => s.accountId === accountId);
  const ledger = buildLedger(accountId, index.accountDailyDelta.get(accountId), snapshots);
  cache.set(accountId, { version, snapshots: doc.balanceSnapshots, ledger });
  return ledger;
}

export function isLiability(account: Pick<Account, 'type'>): boolean {
  return LIABILITY_ACCOUNT_TYPES.has(account.type);
}

// ── Net worth ────────────────────────────────────────────────────────────────

export interface NetWorthPoint {
  date: ISODate;
  assets: Cents;
  /** Sum of liability balances (negative when money is owed). */
  liabilities: Cents;
  net: Cents;
}

/** Net worth at the end of each sample date. Cost: O(accounts × samples × log n). */
export function netWorthSeries(
  doc: Pick<DocModel, 'accounts' | 'balanceSnapshots'>,
  index: DocIndex,
  sampleDates: readonly ISODate[],
): NetWorthPoint[] {
  const accounts = Object.values(doc.accounts).map((a) => ({
    liability: isLiability(a),
    ledger: getLedger(doc, index, a.id),
  }));
  return sampleDates.map((date) => {
    let assets = 0;
    let liabilities = 0;
    for (const { liability, ledger } of accounts) {
      const balance = balanceAtEnd(ledger, date);
      if (liability) liabilities += balance;
      else assets += balance;
    }
    return { date, assets, liabilities, net: assets + liabilities };
  });
}

/** Earliest date with any balance data across all accounts. */
export function firstDataDate(
  doc: Pick<DocModel, 'accounts' | 'balanceSnapshots'>,
  index: DocIndex,
): ISODate | null {
  let first: ISODate | null = null;
  for (const a of Object.values(doc.accounts)) {
    const d = getLedger(doc, index, a.id).firstDate;
    if (d && (!first || d < first)) first = d;
  }
  return first;
}

/** Sum of snapshot adjustments (market change / discrepancies) with dates in (from, to]. */
export function adjustmentsBetween(ledger: AccountLedger, from: ISODate, to: ISODate): Cents {
  let total = 0;
  for (const a of ledger.anchors) {
    if (a.snapshot.date > from && a.snapshot.date <= to) total += a.adjustment;
  }
  return total;
}

/** Balance of the transaction's account right after this transaction (same-day order: by id). */
export function balanceAfterTransaction(
  doc: Pick<DocModel, 'balanceSnapshots' | 'transactions'>,
  index: DocIndex,
  t: { id: Id; accountId: Id; date: ISODate; amount: Cents },
): Cents {
  const ledger = getLedger(doc, index, t.accountId);
  let balance = balanceAtStart(ledger, t.date);
  const keys = index.byAccount.get(t.accountId) ?? [];
  const own = `${t.date}|${t.id}`;
  for (let i = lowerBound(keys, `${t.date}|`); i < keys.length; i++) {
    const key = keys[i] as string;
    if (key > own) break;
    const id = key.slice(11);
    balance += id === t.id ? t.amount : (getTransactionAmount(doc, id) ?? 0);
  }
  return balance;
}

function getTransactionAmount(doc: Pick<DocModel, 'transactions'>, id: Id): Cents | undefined {
  return getTransaction(doc, id)?.amount;
}

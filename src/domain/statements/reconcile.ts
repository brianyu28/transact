/**
 * Statement reconciliation. A transaction is "on" a statement when its `statementId`
 * points at it (set as you check items off, so progress is saved); finishing the
 * statement marks those transactions reconciled.
 *
 * Candidates are the account's transactions dated within the statement period ± the
 * grace days (posting dates often lag), plus older transactions that were never
 * reconciled, minus anything already on another statement. Items marked reconciled by
 * hand (without a statement) are offered within the window so they can be assigned.
 */
import { addDays, type ISODate } from '@/lib/date';
import { balanceAtStart, getLedger } from '../aggregates/balances';
import { idFromKey, type DocIndex } from '../aggregates/docIndex';
import { getTransaction, iterateTransactions, type DocModel } from '../model';
import type { Cents, Id, Statement, Transaction } from '../schema/types';

export type CandidatePosition = 'earlier' | 'before' | 'in' | 'after';

export interface Candidate {
  transaction: Transaction;
  /** Where the date falls relative to the statement period. */
  position: CandidatePosition;
  checked: boolean;
}

export function reconcileCandidates(
  doc: Pick<DocModel, 'transactions'>,
  index: DocIndex,
  statement: Statement,
  graceDays: number,
): Candidate[] {
  const from = addDays(statement.startDate, -graceDays);
  const to = addDays(statement.endDate, graceDays);
  const out: Candidate[] = [];
  const push = (t: Transaction, date: ISODate) => {
    const position: CandidatePosition =
      date < from
        ? 'earlier'
        : date < statement.startDate
          ? 'before'
          : date > statement.endDate
            ? 'after'
            : 'in';
    out.push({ transaction: t, position, checked: t.statementId === statement.id });
  };

  // Older items: this statement's own, plus any never reconciled (both from the index).
  const older = new Set<string>();
  for (const key of index.byStatement.get(statement.id) ?? [])
    if (key.slice(0, 10) < from) older.add(key);
  for (const key of index.unreconciled.get(statement.accountId) ?? [])
    if (key.slice(0, 10) < from) older.add(key);
  for (const key of older) {
    const t = getTransaction(doc, idFromKey(key));
    if (t && (t.statementId === undefined || t.statementId === statement.id))
      push(t, key.slice(0, 10));
  }
  const keys = index.byAccount.get(statement.accountId) ?? [];
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((keys[mid] as string) < from) lo = mid + 1;
    else hi = mid;
  }
  // The statement window (± grace).
  for (let i = lo; i < keys.length; i++) {
    const key = keys[i] as string;
    const date = key.slice(0, 10);
    if (date > to) break;
    const t = getTransaction(doc, idFromKey(key));
    if (!t) continue;
    // Never steal items from another statement.
    if (t.statementId !== undefined && t.statementId !== statement.id) continue;
    push(t, date);
  }
  out.sort((a, b) =>
    a.transaction.date < b.transaction.date ? -1 : a.transaction.date > b.transaction.date ? 1 : 0,
  );
  return out;
}

export interface StatementSummary {
  /** Sum of checked transactions. */
  clearedChange: Cents;
  clearedBalance: Cents;
  /** closing − cleared balance; 0 means reconciled. */
  difference: Cents;
  charges: Cents;
  credits: Cents;
  count: number;
}

/** Totals for the transactions currently on the statement. */
export function statementSummary(
  statement: Statement,
  members: readonly Transaction[],
): StatementSummary {
  let charges = 0;
  let credits = 0;
  for (const t of members) {
    if (t.amount < 0) charges += -t.amount;
    else credits += t.amount;
  }
  const clearedChange = credits - charges;
  const clearedBalance = statement.openingBalance + clearedChange;
  return {
    clearedChange,
    clearedBalance,
    difference: statement.closingBalance - clearedBalance,
    charges,
    credits,
    count: members.length,
  };
}

/** All transactions on a statement (scans only that account). */
export function statementMembers(
  doc: Pick<DocModel, 'transactions'>,
  index: DocIndex,
  statement: Pick<Statement, 'id' | 'accountId'>,
): Transaction[] {
  const out: Transaction[] = [];
  for (const key of index.byStatement.get(statement.id) ?? []) {
    const t = getTransaction(doc, idFromKey(key));
    if (t) out.push(t);
  }
  return out;
}

export interface NewStatementDefaults {
  startDate: ISODate;
  openingBalance: Cents;
}

/**
 * Sensible defaults for the next statement of an account: it starts the day after the
 * previous statement ended, opening with that statement's closing balance (otherwise the
 * balance computed from transactions and balance updates).
 */
export function nextStatementDefaults(
  doc: Pick<DocModel, 'statements' | 'balanceSnapshots'>,
  index: DocIndex,
  accountId: Id,
  fallbackStart: ISODate,
): NewStatementDefaults {
  const previous = Object.values(doc.statements)
    .filter((s) => s.accountId === accountId)
    .sort((a, b) => (a.endDate < b.endDate ? 1 : -1))[0];
  if (previous)
    return { startDate: addDays(previous.endDate, 1), openingBalance: previous.closingBalance };
  return {
    startDate: fallbackStart,
    openingBalance: balanceAtStart(getLedger(doc, index, accountId), fallbackStart),
  };
}

/** Transactions grouped by statement, in one pass (memoized on the transactions object). */
const membersCache = new WeakMap<object, Map<Id, Transaction[]>>();
export function membersByStatement(
  doc: Pick<DocModel, 'transactions'>,
): ReadonlyMap<Id, Transaction[]> {
  let map = membersCache.get(doc.transactions);
  if (!map) {
    map = new Map();
    for (const t of iterateTransactions(doc)) {
      if (!t.statementId) continue;
      const list = map.get(t.statementId) ?? [];
      list.push(t);
      map.set(t.statementId, list);
    }
    membersCache.set(doc.transactions, map);
  }
  return map;
}

import { beforeEach, describe, expect, it } from 'vitest';
import { balanceAtEnd, getLedger } from '@/domain/aggregates/balances';
import { getTransaction } from '@/domain/model';
import { createEmptyDocument } from '@/domain/schema/defaults';
import {
  nextStatementDefaults,
  reconcileCandidates,
  statementMembers,
  statementSummary,
} from '@/domain/statements/reconcile';
import { createDocStore } from './docStore';

let store: ReturnType<typeof createDocStore>;
const s = () => store.getState();
const d = () => s().dispatch;
const doc = () => s().doc!;
let card: string;

const txn = (date: string, dollars: number, extra: { reconciled?: true } = {}) => {
  const id = d()('createTransaction', {
    accountId: card,
    date,
    payee: 'P',
    amount: Math.round(dollars * 100),
  });
  if (extra.reconciled) d()('updateTransaction', { id, changes: { reconciled: true } });
  return id;
};

const statement = () =>
  d()('createStatement', {
    accountId: card,
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    openingBalance: -10000,
    closingBalance: -25000,
  });

const candidates = (id: string) =>
  reconcileCandidates(doc(), s().index!, doc().statements[id]!, 7).map((c) => ({
    date: c.transaction.date,
    position: c.position,
    checked: c.checked,
  }));

beforeEach(() => {
  store = createDocStore();
  store.getState().load(createEmptyDocument({ appVersion: 'test' }));
  card = d()('createAccount', { name: 'Card', type: 'credit' });
});

describe('reconciliation', () => {
  it('offers in-period items, grace-window items and old uncleared items', () => {
    txn('2026-08-15', -5); // old and uncleared: offered
    txn('2026-08-16', -6, { reconciled: true }); // old and reconciled: not offered
    txn('2026-09-27', -7); // within the grace window before
    txn('2026-10-10', -100);
    txn('2026-11-05', -8); // within the grace window after
    txn('2026-11-20', -9); // too late
    const id = statement();
    expect(candidates(id)).toEqual([
      { date: '2026-08-15', position: 'earlier', checked: false },
      { date: '2026-09-27', position: 'before', checked: false },
      { date: '2026-10-10', position: 'in', checked: false },
      { date: '2026-11-05', position: 'after', checked: false },
    ]);
  });

  it('tracks the difference as items are checked, and finishing reconciles them', () => {
    const a = txn('2026-10-03', -100);
    const b = txn('2026-10-20', -60);
    const pay = txn('2026-10-25', 10);
    const id = statement();
    const summary = () =>
      statementSummary(
        doc().statements[id]!,
        statementMembers(doc(), s().index!, { id, accountId: card }),
      );
    expect(summary().difference).toBe(-15000);

    d()('setStatementMembership', { statementId: id, ids: [a, b, pay], member: true });
    expect(summary()).toMatchObject({
      charges: 16000,
      credits: 1000,
      clearedBalance: -25000,
      difference: 0,
    });
    expect(getTransaction(doc(), a)?.reconciled).toBeUndefined(); // checked, not yet reconciled

    d()('finishStatement', { id, recordBalance: true });
    expect(getTransaction(doc(), a)?.reconciled).toBe(true);
    expect(doc().statements[id]?.status).toBe('reconciled');
    // The closing balance is recorded at the start of the next day.
    const ledger = getLedger(doc(), s().index!, card);
    expect(balanceAtEnd(ledger, '2026-10-31')).toBe(-25000);
    expect(Object.values(doc().balanceSnapshots)).toEqual([
      expect.objectContaining({ date: '2026-11-01', balance: -25000, source: 'statement' }),
    ]);

    // Items on a statement aren't offered to other statements.
    const next = d()('createStatement', {
      accountId: card,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      openingBalance: -25000,
      closingBalance: -25000,
    });
    expect(candidates(next)).toEqual([]);
  });

  it('reopens and deletes statements, restoring transactions', () => {
    const a = txn('2026-10-03', -150);
    const id = statement();
    d()('setStatementMembership', { statementId: id, ids: [a], member: true });
    d()('finishStatement', { id, recordBalance: false });
    d()('reopenStatement', { id });
    expect(getTransaction(doc(), a)).toMatchObject({ statementId: id });
    expect(getTransaction(doc(), a)?.reconciled).toBeUndefined();
    d()('deleteStatement', { id });
    expect(getTransaction(doc(), a)?.statementId).toBeUndefined();
  });

  it('can close an unexplained gap with an excluded adjustment', () => {
    const id = statement();
    const adj = d()('addReconcileAdjustment', { statementId: id, amount: -15000 });
    expect(getTransaction(doc(), adj)).toMatchObject({
      excluded: true,
      statementId: id,
      amount: -15000,
    });
    const summary = statementSummary(
      doc().statements[id]!,
      statementMembers(doc(), s().index!, { id, accountId: card }),
    );
    expect(summary.difference).toBe(0);
  });

  it('suggests where the next statement starts and its opening balance', () => {
    expect(nextStatementDefaults(doc(), s().index!, card, '2026-10-01')).toEqual({
      startDate: '2026-10-01',
      openingBalance: 0,
    });
    statement();
    expect(nextStatementDefaults(doc(), s().index!, card, '2026-10-01')).toEqual({
      startDate: '2026-11-01',
      openingBalance: -25000,
    });
  });
});

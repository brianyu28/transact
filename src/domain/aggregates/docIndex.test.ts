import { describe, expect, it } from 'vitest';
import { generateDemoDocument } from '../demo/generate';
import {
  countTransactions,
  getTransaction,
  iterateTransactions,
  putTransaction,
  removeTransaction,
} from '../model';
import type { Transaction } from '../schema/types';
import { DocIndex } from './docIndex';

const doc = generateDemoDocument({ endDate: '2026-06-30', years: 1, appVersion: 'test', seed: 9 });

/** Compares two indexes structurally. */
function snapshot(index: DocIndex) {
  const sortMap = <V>(m: Map<string, V>) => [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  return {
    byDate: index.byDate,
    byAccount: sortMap(index.byAccount),
    categoryByMonth: sortMap(index.categoryByMonth).map(([k, v]) => [k, sortMap(v)]),
    accountDailyDelta: sortMap(index.accountDailyDelta).map(([k, v]) => [k, sortMap(v)]),
    unreconciled: sortMap(index.unreconciled).map(([k, v]) => [k, [...v].sort()]),
    byStatement: sortMap(index.byStatement).map(([k, v]) => [k, [...v].sort()]),
  };
}

describe('DocIndex', () => {
  it('keeps keys sorted by date', () => {
    const index = DocIndex.build(doc);
    expect(index.byDate.length).toBe(countTransactions(doc));
    expect([...index.byDate].sort()).toEqual(index.byDate);
  });

  it('incremental updates match a full rebuild', () => {
    const index = DocIndex.build(doc);
    const working = { ...doc, transactions: structuredClone(doc.transactions) };
    const ids = [...iterateTransactions(working)].map((t) => t.id);

    // Edit: move a transaction to another date, amount and category.
    const edited = getTransaction(working, ids[10]!)!;
    const changed: Transaction = {
      ...edited,
      date: '2026-01-15',
      amount: edited.amount - 1234,
      reconciled: true,
      statementId: 'stm_aaaaaaaaaaaa',
    };
    delete changed.categoryId;
    putTransaction(working, changed);
    index.update(edited, changed);

    // Delete one, create one.
    const removed = getTransaction(working, ids[20]!)!;
    removeTransaction(working, removed.id);
    index.update(removed, undefined);
    const created: Transaction = { ...removed, id: 'txn_newnewnewnew', date: '2026-03-03' };
    putTransaction(working, created);
    index.update(undefined, created);

    expect(snapshot(index)).toEqual(snapshot(DocIndex.build(working)));
  });

  it('queries ids within a date range', () => {
    const index = DocIndex.build(doc);
    const ids = index.idsInRange('2026-03-01', '2026-03-31');
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(getTransaction(doc, id)!.date.startsWith('2026-03')).toBe(true);
  });
});

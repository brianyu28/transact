import { beforeEach, describe, expect, it } from 'vitest';
import { generateDemoDocument } from '@/domain/demo/generate';
import { getTransaction, iterateTransactions } from '@/domain/model';
import { createEmptyDocument } from '@/domain/schema/defaults';
import { CommandError } from '@/domain/commands';
import { createDocStore, selectIsDirty } from './docStore';

let store: ReturnType<typeof createDocStore>;

beforeEach(() => {
  store = createDocStore();
  store.getState().load(createEmptyDocument({ appVersion: 'test' }));
});

function addAccountAndTxn() {
  const { dispatch } = store.getState();
  const accountId = dispatch('createAccount', { name: 'Checking', type: 'checking' });
  const txnId = dispatch('createTransaction', {
    accountId,
    date: '2026-11-20',
    payee: 'Corner Grocer',
    amount: -4210,
  });
  return { accountId, txnId };
}

describe('docStore', () => {
  it('applies commands and returns their results', () => {
    const { accountId, txnId } = addAccountAndTxn();
    const { doc, index } = store.getState();
    expect(doc?.accounts[accountId]?.name).toBe('Checking');
    expect(getTransaction(doc!, txnId)).toMatchObject({ payee: 'Corner Grocer', amount: -4210 });
    expect(index?.idsInRange('2026-11-01', '2026-11-30')).toEqual([txnId]);
  });

  it('tracks dirty state against the last save', () => {
    expect(selectIsDirty(store.getState())).toBe(false);
    addAccountAndTxn();
    expect(selectIsDirty(store.getState())).toBe(true);
    store.getState().markSaved(store.getState().editSeq);
    expect(selectIsDirty(store.getState())).toBe(false);
  });

  it('undoes and redoes, keeping the index in sync', () => {
    const { txnId } = addAccountAndTxn();
    const { dispatch } = store.getState();
    dispatch('updateTransaction', { id: txnId, changes: { date: '2026-10-05', amount: -999 } });
    expect(store.getState().undoLabel).toBe('Edit transaction');

    store.getState().undo();
    expect(getTransaction(store.getState().doc!, txnId)?.date).toBe('2026-11-20');
    expect(store.getState().index?.idsInRange('2026-11-01', '2026-11-30')).toEqual([txnId]);
    expect(store.getState().index?.idsInRange('2026-10-01', '2026-10-31')).toEqual([]);

    store.getState().redo();
    expect(getTransaction(store.getState().doc!, txnId)?.amount).toBe(-999);
    expect(store.getState().index?.idsInRange('2026-10-01', '2026-10-31')).toEqual([txnId]);
  });

  it('removes fields set to undefined rather than storing defaults', () => {
    const { txnId } = addAccountAndTxn();
    const { dispatch } = store.getState();
    dispatch('updateTransaction', { id: txnId, changes: { reconciled: true, note: 'hi' } });
    dispatch('updateTransaction', {
      id: txnId,
      changes: { reconciled: undefined, note: undefined },
    });
    const t = getTransaction(store.getState().doc!, txnId);
    expect(t && 'reconciled' in t).toBe(false);
    expect(t && 'note' in t).toBe(false);
  });

  it('deletes both sides of a transfer and leaves tombstones', () => {
    store
      .getState()
      .load(generateDemoDocument({ endDate: '2026-03-31', years: 0.25, appVersion: 't' }));
    const doc = store.getState().doc!;
    const transfer = [...iterateTransactions(doc)].find((t) => t.transfer)!;
    store.getState().dispatch('deleteTransactions', { ids: [transfer.id] });
    const after = store.getState().doc!;
    expect(getTransaction(after, transfer.id)).toBeUndefined();
    expect(getTransaction(after, transfer.transfer!.peerId)).toBeUndefined();
    expect(after.tombstones.map((t) => t.id)).toEqual(
      expect.arrayContaining([transfer.id, transfer.transfer!.peerId]),
    );
  });

  it('rejects invalid commands without changing the document', () => {
    const before = store.getState().doc;
    expect(() =>
      store.getState().dispatch('createTransaction', {
        accountId: 'acc_missing00000',
        date: '2026-01-01',
        payee: 'x',
        amount: 1,
      }),
    ).toThrow(CommandError);
    expect(store.getState().doc).toBe(before);
    expect(store.getState().undoLabel).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { generateDemoDocument } from '../demo/generate';
import {
  getTransaction,
  iterateTransactions,
  putTransaction,
  removeTransaction,
  type DocModel,
} from '../model';
import { mergeDocuments } from './merge';

const clone = (d: DocModel): DocModel => structuredClone(d);
const base = generateDemoDocument({ endDate: '2026-03-31', years: 0.25, appVersion: 't', seed: 4 });
const txns = [...iterateTransactions(base)];
const [t1, t2, t3] = txns;

function edit(doc: DocModel, id: string, patch: object, at: string) {
  putTransaction(doc, { ...getTransaction(doc, id)!, ...patch, updatedAt: at });
}

describe('mergeDocuments (with a base)', () => {
  it('combines independent edits from both devices', () => {
    const local = clone(base);
    const remote = clone(base);
    edit(local, t1!.id, { payee: 'Local payee' }, '2026-04-01T10:00:00.000Z');
    edit(remote, t2!.id, { payee: 'Remote payee' }, '2026-04-01T11:00:00.000Z');
    remote.tags.tag_new000000001 = {
      id: 'tag_new000000001',
      name: 'from-phone',
      updatedAt: '2026-04-01T11:00:00.000Z',
    };

    const { merged, conflicts } = mergeDocuments(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(getTransaction(merged, t1!.id)?.payee).toBe('Local payee');
    expect(getTransaction(merged, t2!.id)?.payee).toBe('Remote payee');
    expect(merged.tags.tag_new000000001?.name).toBe('from-phone');
  });

  it('applies deletions from either side', () => {
    const local = clone(base);
    const remote = clone(base);
    removeTransaction(remote, t3!.id);
    const { merged } = mergeDocuments(base, local, remote);
    expect(getTransaction(merged, t3!.id)).toBeUndefined();
  });

  it('resolves conflicting edits by the newer edit and reports them', () => {
    const local = clone(base);
    const remote = clone(base);
    edit(local, t1!.id, { amount: -111 }, '2026-04-01T10:00:00.000Z');
    edit(remote, t1!.id, { amount: -222 }, '2026-04-01T12:00:00.000Z');
    const { merged, conflicts } = mergeDocuments(base, local, remote);
    expect(getTransaction(merged, t1!.id)?.amount).toBe(-222);
    expect(conflicts).toEqual([
      expect.objectContaining({
        collection: 'transactions',
        id: t1!.id,
        resolution: 'kept-remote',
      }),
    ]);
  });

  it('keeps an edit over a deletion', () => {
    const local = clone(base);
    const remote = clone(base);
    edit(local, t2!.id, { note: 'important' }, '2026-04-01T10:00:00.000Z');
    removeTransaction(remote, t2!.id);
    const { merged, conflicts } = mergeDocuments(base, local, remote);
    expect(getTransaction(merged, t2!.id)?.note).toBe('important');
    expect(conflicts[0]?.resolution).toBe('kept-edit-over-delete');
  });

  it('repairs transfers whose other side was deleted on the other device', () => {
    const transfer = txns.find((t) => t.transfer)!;
    const local = clone(base);
    const remote = clone(base);
    removeTransaction(remote, transfer.transfer!.peerId);
    removeTransaction(remote, transfer.id);
    // Local edited only one side; the other side's deletion still applies.
    edit(local, transfer.transfer!.peerId, {}, transfer.updatedAt);
    edit(local, transfer.id, { note: 'kept' }, '2026-04-02T00:00:00.000Z');
    const { merged } = mergeDocuments(base, local, remote);
    expect(getTransaction(merged, transfer.id)?.transfer).toBeUndefined();
  });

  it('merges settings per field and keeps the higher revision', () => {
    const local = clone(base);
    const remote = clone(base);
    remote.meta.revision = 7;
    remote.settings = { ...remote.settings, reconcileGraceDays: 3 };
    local.settings = { ...local.settings, weekStartsOn: 1 };
    const { merged } = mergeDocuments(base, local, remote);
    expect(merged.settings).toMatchObject({ reconcileGraceDays: 3, weekStartsOn: 1 });
    expect(merged.meta.revision).toBe(7);
  });
});

describe('mergeDocuments (without a base)', () => {
  it('keeps records from both sides and honours newer tombstones', () => {
    const local = clone(base);
    const remote = clone(base);
    putTransaction(local, { ...t1!, id: 'txn_localonly0001' });
    removeTransaction(remote, t2!.id);
    remote.tombstones.push({ id: t2!.id, deletedAt: '2099-01-01T00:00:00.000Z' });
    const { merged } = mergeDocuments(null, local, remote);
    expect(getTransaction(merged, 'txn_localonly0001')).toBeDefined();
    expect(getTransaction(merged, t2!.id)).toBeUndefined();
  });
});

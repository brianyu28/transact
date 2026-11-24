import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeDocument, encodeDocument, peekHeader } from '@/persistence/codec';
import type { SaveResult, StorageAdapter } from '@/persistence/types';
import { workingCopyStore } from '@/persistence/workingCopy';
import { docStore, selectIsDirty } from './docStore';
import { session, sessionStore } from './sessionStore';

/** A fake file on "disk" that other devices can also write to. */
const disk = { bytes: null as Uint8Array | null, lastModified: 0 };

function writeDisk(bytes: Uint8Array): SaveResult {
  disk.bytes = bytes;
  disk.lastModified += 1000;
  return {
    ok: true,
    version: { lastModified: disk.lastModified },
    descriptor: { kind: 'fs-access', name: 'test.transact.json' },
    handle: 'handle',
  };
}

const memoryAdapter: StorageAdapter = {
  kind: 'fs-access',
  capabilities: { writeBack: true },
  open: () =>
    Promise.resolve(
      disk.bytes && {
        bytes: disk.bytes,
        descriptor: { kind: 'fs-access', name: 'test.transact.json' },
        version: { lastModified: disk.lastModified },
        handle: 'handle',
      },
    ),
  save: (bytes, { base, force }) =>
    Promise.resolve(
      !force && disk.bytes && base.lastModified !== disk.lastModified
        ? { ok: false, reason: 'changed', remoteBytes: disk.bytes }
        : writeDisk(bytes),
    ),
  saveAs: (bytes) => Promise.resolve(writeDisk(bytes)),
};

vi.mock('@/persistence/adapters', () => ({
  adapterFor: () => memoryAdapter,
  preferredAdapter: () => memoryAdapter,
}));

const diskRevision = () => peekHeader(disk.bytes!).revision;

/** Simulates another device saving a newer revision of the same file. */
function saveFromOtherDevice() {
  const result = decodeDocument(disk.bytes!);
  if (!result.ok) throw new Error('bad disk file');
  const model = result.model;
  writeDisk(
    encodeDocument({ ...model, meta: { ...model.meta, revision: model.meta.revision + 1 } }),
  );
}

function addAccount(name = 'Checking') {
  docStore.getState().dispatch('createAccount', { name, type: 'checking' });
}

beforeEach(async () => {
  disk.bytes = null;
  disk.lastModified = 0;
  await session.clearLocalData();
});

describe('session', () => {
  it('creates, saves and reopens a document', async () => {
    await session.newDocument('empty');
    addAccount();
    expect(selectIsDirty(docStore.getState())).toBe(true);

    await session.save();
    expect(diskRevision()).toBe(1);
    expect(selectIsDirty(docStore.getState())).toBe(false);
    expect(sessionStore.getState().source?.name).toBe('test.transact.json');

    await session.close();
    expect(docStore.getState().doc).toBeNull();
    await session.open();
    expect(Object.values(docStore.getState().doc!.accounts).map((a) => a.name)).toEqual([
      'Checking',
    ]);
  });

  it('detects a conflicting save from another device and can keep local edits', async () => {
    await session.newDocument('empty');
    await session.save();
    saveFromOtherDevice(); // disk is now revision 2
    addAccount('Local edit');

    await session.save();
    expect(sessionStore.getState().conflict).toMatchObject({ origin: 'save', remoteRevision: 2 });
    expect(diskRevision()).toBe(2); // nothing overwritten yet

    await session.resolveConflict('keep-mine');
    expect(sessionStore.getState().conflict).toBeNull();
    expect(diskRevision()).toBe(3);
    const saved = decodeDocument(disk.bytes!);
    expect(saved.ok && Object.values(saved.model.accounts).map((a) => a.name)).toEqual([
      'Local edit',
    ]);
  });

  it('can take the other version instead', async () => {
    await session.newDocument('empty');
    await session.save();
    saveFromOtherDevice();
    addAccount('Local edit');
    await session.save();

    await session.resolveConflict('take-theirs');
    expect(Object.keys(docStore.getState().doc!.accounts)).toEqual([]);
    expect(sessionStore.getState().baseRevision).toBe(2);
  });

  it('restores unsaved edits from the working copy on boot', async () => {
    await session.newDocument('empty');
    addAccount('Unsaved');
    await session.flush();
    expect((await workingCopyStore.load())?.dirty).toBe(true);

    docStore.getState().unload();
    sessionStore.setState({ status: 'booting', notices: [] });
    await session.boot();

    expect(sessionStore.getState().status).toBe('ready');
    expect(Object.values(docStore.getState().doc!.accounts).map((a) => a.name)).toEqual([
      'Unsaved',
    ]);
    expect(selectIsDirty(docStore.getState())).toBe(true);
    expect(sessionStore.getState().notices.map((n) => n.kind)).toEqual(['restored']);
  });

  it('shows a clear error for files from a newer app version', async () => {
    disk.bytes = new TextEncoder().encode(
      JSON.stringify({ format: 'transact', schemaVersion: 99 }),
    );
    await session.open();
    expect(sessionStore.getState().loadError?.message).toMatch(/schema version 99/);
  });
});

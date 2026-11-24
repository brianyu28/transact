/**
 * The working copy: the open document, saved to IndexedDB on every change (debounced),
 * so nothing is lost if the tab closes before the user saves to their file. It stores
 * the same encoded bytes as the file, so an encrypted file stays encrypted at rest.
 */
import { clear, createStore, del, get, set, type UseStore } from 'idb-keyval';
import type { SourceDescriptor, VersionToken } from './types';

export interface WorkingCopy {
  bytes: Uint8Array;
  fileId: string;
  /** Revision of the file this copy was loaded from / last saved to. */
  baseRevision: number;
  baseVersion: VersionToken;
  /** null for a new file that has never been saved. */
  source: SourceDescriptor | null;
  /** Has changes not yet saved to the file. */
  dirty: boolean;
  updatedAt: string;
}

let store: UseStore | undefined;
const db = () => (store ??= createStore('transact', 'kv'));

const WORKING_COPY = 'working-copy';
const handleKey = (fileId: string) => `handle:${fileId}`;
const RECENT = 'recent';

export interface RecentFile {
  fileId: string;
  source: SourceDescriptor;
}

/** A remembered (non-extractable) decryption key for one file on this device. */
export interface StoredKey {
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
}

const keyKey = (fileId: string) => `key:${fileId}`;
const baseKey = (fileId: string) => `base:${fileId}`;

export const workingCopyStore = {
  load: () => get<WorkingCopy>(WORKING_COPY, db()),
  save: (copy: WorkingCopy) => set(WORKING_COPY, copy, db()),
  remove: () => del(WORKING_COPY, db()),

  loadHandle: (fileId: string) => get<unknown>(handleKey(fileId), db()),
  saveHandle: (fileId: string, handle: unknown) => set(handleKey(fileId), handle, db()),

  loadRecent: () => get<RecentFile>(RECENT, db()),

  /** Encryption keys remembered on this device ("Remember on this device"). */
  loadKey: (fileId: string) => get<StoredKey>(keyKey(fileId), db()),
  saveKey: (fileId: string, key: StoredKey) => set(keyKey(fileId), key, db()),
  deleteKey: (fileId: string) => del(keyKey(fileId), db()),

  /**
   * The file as last read from or written to storage: the common base for merging when
   * another device changed the file too. Stored as file bytes (encrypted if the file is).
   */
  loadBase: (fileId: string) => get<Uint8Array>(baseKey(fileId), db()),
  saveBase: (fileId: string, bytes: Uint8Array) => set(baseKey(fileId), bytes, db()),
  saveRecent: (recent: RecentFile) => set(RECENT, recent, db()),

  /** Removes everything Transact stores in this browser's IndexedDB. */
  clearAll: () => clear(db()),
};

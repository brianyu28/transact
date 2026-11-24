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

export const workingCopyStore = {
  load: () => get<WorkingCopy>(WORKING_COPY, db()),
  save: (copy: WorkingCopy) => set(WORKING_COPY, copy, db()),
  remove: () => del(WORKING_COPY, db()),

  loadHandle: (fileId: string) => get<unknown>(handleKey(fileId), db()),
  saveHandle: (fileId: string, handle: unknown) => set(handleKey(fileId), handle, db()),

  loadRecent: () => get<RecentFile>(RECENT, db()),
  saveRecent: (recent: RecentFile) => set(RECENT, recent, db()),

  /** Removes everything Transact stores in this browser's IndexedDB. */
  clearAll: () => clear(db()),
};

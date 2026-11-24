/**
 * File session: which file is open, where it came from, and the open/save/close flows.
 * Coordinates the document store, the I/O worker, storage adapters and the IndexedDB
 * working copy. UI components call these actions and render the resulting state.
 */
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { DocModel } from '@/domain/model';
import { createEmptyDocument } from '@/domain/schema/defaults';
import { describeLoadError, type LoadError } from '@/domain/schema/loadError';
import type { IntegrityIssue } from '@/domain/schema/integrity';
import { today } from '@/lib/date';
import { newId } from '@/lib/id';
import { adapterFor, preferredAdapter } from '@/persistence/adapters';
import { io } from '@/persistence/io';
import {
  FILE_EXTENSION,
  type OpenedFile,
  type SourceDescriptor,
  type VersionToken,
} from '@/persistence/types';
import { workingCopyStore, type RecentFile } from '@/persistence/workingCopy';
import { docStore, selectIsDirty } from './docStore';

export type Notice =
  | { kind: 'restored'; updatedAt: string }
  | { kind: 'migrated'; fromVersion: number; fileName: string; originalBytes: Uint8Array }
  | { kind: 'integrity'; issues: IntegrityIssue[] }
  | { kind: 'error'; title: string; message: string };

/** Another copy of the file changed since we last read or wrote it. */
export interface Conflict {
  origin: 'save' | 'open';
  remoteBytes: Uint8Array;
  remoteRevision: number | null;
  remoteSavedAt: string | null;
  /** For `open` conflicts: the newly opened file, so "take theirs" can load it. */
  opened?: OpenedFile;
}

export interface SessionState {
  status: 'booting' | 'empty' | 'loading' | 'ready';
  source: SourceDescriptor | null;
  baseVersion: VersionToken;
  /** Revision of the file as last read from or written to storage. */
  baseRevision: number;
  saving: boolean;
  lastSavedAt: string | null;
  conflict: Conflict | null;
  notices: Notice[];
  /** Error from the last failed open, shown on the welcome screen. */
  loadError: { fileName: string; message: string } | null;
  recent: RecentFile | null;
}

const DEVICE_ID_KEY = 'transact:device-id';
const WORKING_COPY_DEBOUNCE_MS = 500;

function deviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = newId('device');
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

const initialState: SessionState = {
  status: 'booting',
  source: null,
  baseVersion: {},
  baseRevision: 0,
  saving: false,
  lastSavedAt: null,
  conflict: null,
  notices: [],
  loadError: null,
  recent: null,
};

export const sessionStore = createStore<SessionState>()(() => initialState);

export function useSession<T>(selector: (state: SessionState) => T): T {
  return useStore(sessionStore, selector);
}

const set = (partial: Partial<SessionState>) => {
  sessionStore.setState(partial);
};
const get = () => sessionStore.getState();
const addNotice = (notice: Notice) => {
  set({ notices: [...get().notices.filter((n) => n.kind !== notice.kind), notice] });
};

// ── Working copy ──────────────────────────────────────────────────────────────

let workingCopyTimer: ReturnType<typeof setTimeout> | undefined;
let workingCopyWrite: Promise<void> = Promise.resolve();

/** Writes the working copy now (serialized so writes never interleave). */
function flushWorkingCopy(): Promise<void> {
  clearTimeout(workingCopyTimer);
  workingCopyTimer = undefined;
  workingCopyWrite = workingCopyWrite.then(async () => {
    const state = docStore.getState();
    const { doc } = state;
    if (!doc) return;
    const { source, baseRevision, baseVersion } = get();
    await workingCopyStore.save({
      bytes: await io.encode(doc),
      fileId: doc.meta.fileId,
      baseRevision,
      baseVersion,
      source,
      dirty: selectIsDirty(docStore.getState()),
      updatedAt: new Date().toISOString(),
    });
  });
  return workingCopyWrite.catch((err: unknown) => {
    console.error('Failed to save working copy', err);
  });
}

function scheduleWorkingCopy() {
  clearTimeout(workingCopyTimer);
  workingCopyTimer = setTimeout(() => void flushWorkingCopy(), WORKING_COPY_DEBOUNCE_MS);
}

let subscribed = false;
function subscribeToEdits() {
  if (subscribed) return;
  subscribed = true;
  docStore.subscribe((state, prev) => {
    if (state.doc && (state.editSeq !== prev.editSeq || state.savedSeq !== prev.savedSeq)) {
      scheduleWorkingCopy();
    }
  });
  // Flush promptly when the page is hidden or closed (mobile browsers may not return).
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && workingCopyTimer) void flushWorkingCopy();
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function openDocument(
  doc: DocModel,
  session: Partial<SessionState>,
  options: { dirty?: boolean } = {},
) {
  docStore.getState().load(doc, options);
  set({
    status: 'ready',
    conflict: null,
    notices: [],
    loadError: null,
    lastSavedAt: doc.meta.savedAt,
    baseRevision: doc.meta.revision,
    baseVersion: {},
    ...session,
  });
  void flushWorkingCopy();
}

/** Remembers the file for "Reopen" and later saves. Failure here never fails a save or open. */
async function rememberFile(
  fileId: string,
  opened: { descriptor: SourceDescriptor; handle?: unknown },
) {
  const recent: RecentFile = { fileId, source: opened.descriptor };
  set({ recent });
  try {
    await workingCopyStore.saveRecent(recent);
    if (opened.handle) await workingCopyStore.saveHandle(fileId, opened.handle);
  } catch (err) {
    console.warn('Could not remember the file for reopening', err);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Loads bytes that were just opened from storage into the app. */
async function loadOpened(opened: OpenedFile): Promise<void> {
  const result = await io.decode(opened.bytes);
  if (!result.ok) {
    failOpen(opened.descriptor.name, result.error);
    return;
  }
  const { model, migrated, originalVersion, integrityIssues } = result;
  openDocument(
    model,
    { source: opened.descriptor, baseVersion: opened.version },
    { dirty: migrated.length > 0 },
  );
  await rememberFile(model.meta.fileId, opened);
  if (migrated.length > 0) {
    addNotice({
      kind: 'migrated',
      fromVersion: originalVersion,
      fileName: opened.descriptor.name,
      originalBytes: opened.bytes,
    });
  }
  if (integrityIssues.length > 0) addNotice({ kind: 'integrity', issues: integrityIssues });
}

function failOpen(fileName: string, error: LoadError | string) {
  const message = typeof error === 'string' ? error : describeLoadError(error);
  if (docStore.getState().doc) {
    set({ status: 'ready' });
    addNotice({ kind: 'error', title: `Couldn't open ${fileName}`, message });
  } else {
    set({ status: 'empty', loadError: { fileName, message } });
  }
}

function suggestedName(): string {
  const name = get().source?.name;
  return name ?? `Transact ${today()}${FILE_EXTENSION}`;
}

// ── Actions ───────────────────────────────────────────────────────────────────

export const session = {
  /** Restores the working copy (if any) on app start. */
  boot: async (): Promise<void> => {
    subscribeToEdits();
    try {
      const [copy, recent] = await Promise.all([
        workingCopyStore.load(),
        workingCopyStore.loadRecent(),
      ]);
      set({ recent: recent ?? null });
      if (!copy) {
        set({ status: 'empty' });
        return;
      }
      const result = await io.decode(copy.bytes);
      if (!result.ok) {
        set({
          status: 'empty',
          loadError: { fileName: 'Unsaved working copy', message: describeLoadError(result.error) },
        });
        return;
      }
      docStore.getState().load(result.model, { dirty: copy.dirty });
      set({
        status: 'ready',
        source: copy.source,
        baseRevision: copy.baseRevision,
        baseVersion: copy.baseVersion,
        lastSavedAt: result.model.meta.savedAt,
      });
      if (copy.dirty) addNotice({ kind: 'restored', updatedAt: copy.updatedAt });
    } catch (err) {
      console.error('Failed to restore working copy', err);
      set({ status: 'empty' });
    }
  },

  /** Creates a new document (empty or with demo data). It has no file until saved. */
  newDocument: async (kind: 'empty' | 'demo'): Promise<void> => {
    const doc =
      kind === 'demo'
        ? // Loaded on demand: the generator isn't needed for normal use.
          (await import('@/domain/demo/generate')).generateDemoDocument({
            endDate: today(),
            appVersion: __APP_VERSION__,
            seed: Date.now() % 100_000,
          })
        : createEmptyDocument({ appVersion: __APP_VERSION__ });
    openDocument(doc, { source: null, lastSavedAt: null }, { dirty: true });
  },

  /** Prompts for a file and opens it. Callers should confirm discarding unsaved changes first. */
  open: async (): Promise<void> => {
    const adapter = preferredAdapter();
    let opened: OpenedFile | null;
    try {
      opened = await adapter.open();
    } catch (err) {
      failOpen('file', errorMessage(err));
      return;
    }
    if (!opened) return;
    await session.openFromStorage(opened);
  },

  /** Opens already-read file bytes, checking for clashes with unsaved local edits. */
  openFromStorage: async (opened: OpenedFile): Promise<void> => {
    const { doc } = docStore.getState();
    const header = await io.peekHeader(opened.bytes);
    // Same file, unsaved local edits, and the file was saved elsewhere since: a clash.
    if (
      doc &&
      selectIsDirty(docStore.getState()) &&
      header.fileId === doc.meta.fileId &&
      header.revision !== null &&
      header.revision !== get().baseRevision
    ) {
      set({
        conflict: {
          origin: 'open',
          remoteBytes: opened.bytes,
          remoteRevision: header.revision,
          remoteSavedAt: header.savedAt,
          opened,
        },
      });
      return;
    }
    set({ status: 'loading' });
    await loadOpened(opened);
  },

  /** Reopens the most recently used file via its stored handle (File System Access only). */
  reopenRecent: async (): Promise<void> => {
    const recent = get().recent;
    if (!recent) return;
    const adapter = adapterFor(recent.source.kind);
    const handle = await workingCopyStore.loadHandle(recent.fileId);
    if (!adapter.reopen || !handle) {
      await session.open();
      return;
    }
    try {
      const opened = await adapter.reopen(handle, recent.source);
      if (opened) await session.openFromStorage(opened);
    } catch (err) {
      failOpen(recent.source.name, errorMessage(err));
    }
  },

  /** Saves to the current file, or prompts for a location if there isn't one. */
  save: async (options: { saveAs?: boolean; force?: boolean } = {}): Promise<void> => {
    const { doc, editSeq } = docStore.getState();
    if (!doc || get().saving) return;
    set({ saving: true });
    try {
      const now = new Date().toISOString();
      const meta = {
        ...doc.meta,
        revision: get().baseRevision + 1,
        savedAt: now,
        savedBy: deviceId(),
        appVersion: __APP_VERSION__,
      };
      const bytes = await io.encode({ ...doc, meta });

      const { source, baseVersion } = get();
      const handle = source ? await workingCopyStore.loadHandle(doc.meta.fileId) : undefined;
      const adapter = source && !options.saveAs ? adapterFor(source.kind) : preferredAdapter();
      const canWriteBack =
        source && !options.saveAs && (source.kind === 'download' || handle !== undefined);
      const result = canWriteBack
        ? await adapter.save(bytes, {
            handle,
            descriptor: source,
            base: baseVersion,
            ...(options.force ? { force: true } : {}),
          })
        : await adapter.saveAs(bytes, suggestedName());

      if (!result.ok) {
        if (result.reason === 'changed') {
          const header = await io.peekHeader(result.remoteBytes);
          // Only the timestamp changed (e.g. touched by a sync tool): safe to overwrite.
          if (header.fileId === doc.meta.fileId && header.revision === get().baseRevision) {
            set({ saving: false });
            await session.save({ ...options, force: true });
            return;
          }
          set({
            conflict: {
              origin: 'save',
              remoteBytes: result.remoteBytes,
              remoteRevision: header.revision,
              remoteSavedAt: header.savedAt,
            },
          });
        } else if (result.reason === 'failed') {
          addNotice({ kind: 'error', title: 'Save failed', message: result.message });
        }
        return;
      }

      docStore.getState().updateMeta((m) => Object.assign(m, meta));
      docStore.getState().markSaved(editSeq);
      set({
        source: result.descriptor,
        baseVersion: result.version,
        baseRevision: meta.revision,
        lastSavedAt: now,
        conflict: null,
        notices: get().notices.filter((n) => n.kind !== 'restored' && n.kind !== 'migrated'),
      });
      await rememberFile(doc.meta.fileId, result);
      await flushWorkingCopy();
    } catch (err) {
      addNotice({ kind: 'error', title: 'Save failed', message: errorMessage(err) });
    } finally {
      set({ saving: false });
    }
  },

  /** Resolves a conflict between local edits and a file changed elsewhere. */
  resolveConflict: async (choice: 'keep-mine' | 'take-theirs' | 'save-copy'): Promise<void> => {
    const conflict = get().conflict;
    if (!conflict) return;
    set({ conflict: null });
    switch (choice) {
      case 'keep-mine':
        // Overwrite the other version. After an open-conflict there's nothing to do:
        // local edits stay loaded and the next save overwrites (forced).
        // Continue numbering after the other version so revisions never repeat.
        set({ baseRevision: Math.max(get().baseRevision, conflict.remoteRevision ?? 0) });
        if (conflict.origin === 'save') await session.save({ force: true });
        break;
      case 'take-theirs': {
        const opened: OpenedFile = conflict.opened ?? {
          bytes: conflict.remoteBytes,
          descriptor: get().source ?? { kind: 'download', name: suggestedName() },
          version: {},
        };
        set({ status: 'loading' });
        await loadOpened(opened);
        break;
      }
      case 'save-copy': {
        // Give local edits a new identity and save them as a separate file.
        const doc = docStore.getState().doc;
        if (!doc) return;
        docStore.getState().updateMeta((m) => {
          m.fileId = newId('file');
          m.revision = 0;
        });
        set({ source: null, baseRevision: 0, baseVersion: {} });
        await session.save({ saveAs: true });
        break;
      }
    }
  },

  /** Closes the document and discards the working copy. Callers confirm unsaved changes first. */
  close: async (): Promise<void> => {
    clearTimeout(workingCopyTimer);
    workingCopyTimer = undefined;
    await workingCopyWrite;
    docStore.getState().unload();
    set({ ...initialState, status: 'empty', recent: get().recent });
    await workingCopyStore.remove();
  },

  /** Writes pending changes to the working copy immediately. */
  flush: (): Promise<void> => flushWorkingCopy(),

  dismissNotice: (kind: Notice['kind']): void => {
    set({ notices: get().notices.filter((n) => n.kind !== kind) });
  },

  /** Removes all data Transact keeps in this browser (working copy, file handles, preferences). */
  clearLocalData: async (): Promise<void> => {
    await session.close();
    await workingCopyStore.clearAll();
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('transact:')) localStorage.removeItem(key);
    }
    set({ recent: null });
  },
};

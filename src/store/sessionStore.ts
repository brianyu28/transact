/**
 * File session: which file is open, where it came from, and the open/save/close flows.
 * Coordinates the document store, the I/O worker, encryption, storage adapters and the
 * IndexedDB working copy. UI components call these actions and render the resulting state.
 *
 * Bytes in storage (files, the working copy, the merge base) are either plaintext
 * Transact JSON or, when encryption is on, an encrypted envelope around it.
 */
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { DocModel } from '@/domain/model';
import { createEmptyDocument } from '@/domain/schema/defaults';
import { describeLoadError, type LoadError } from '@/domain/schema/loadError';
import type { IntegrityIssue } from '@/domain/schema/integrity';
import { mergeDocuments, type MergeConflict } from '@/domain/sync/merge';
import { today } from '@/lib/date';
import { displayFileName } from '@/lib/format';
import { newId } from '@/lib/id';
import { adapterFor, preferredAdapter } from '@/persistence/adapters';
import {
  completeDropboxSignIn,
  disconnectDropbox,
  downloadDropboxFile,
  dropboxState,
  setDropboxAppKey,
} from '@/persistence/adapters/dropbox';
import {
  DEFAULT_ITERATIONS,
  decryptFile,
  deriveKey,
  encryptFile,
  envelopeSalt,
  randomSalt,
  readEnvelope,
  type EncryptionInfo,
  type Envelope,
} from '@/persistence/codec/crypto';
import { io } from '@/persistence/io';
import {
  FILE_EXTENSION,
  type AdapterKind,
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
  | { kind: 'merged'; fromRemote: number; conflicts: MergeConflict[] }
  | { kind: 'reloaded'; savedAt: string | null }
  | { kind: 'encryption'; message: string }
  | { kind: 'dropbox-connected' }
  | { kind: 'error'; title: string; message: string };

/** Another copy of the file changed since we last read or wrote it. */
export interface Conflict {
  origin: 'save' | 'open';
  remoteBytes: Uint8Array;
  /** Version of the other copy (so a merged save can be checked against it). */
  remoteVersion: VersionToken;
  remoteRevision: number | null;
  remoteSavedAt: string | null;
  /** For `open` conflicts: the newly opened file, so "take theirs" can load it. */
  opened?: OpenedFile;
}

/** An encrypted file waiting for its passphrase. */
export interface Locked {
  fileName: string;
  envelope: Envelope;
  /** Continues loading once decrypted. */
  resume: (plaintext: Uint8Array, encryption: EncryptionInfo) => Promise<void>;
}

/**
 * The open file is encrypted, but a copy of it that isn't encrypted is about to be loaded
 * or merged. Nothing proceeds until the user answers: if they didn't turn encryption off
 * themselves, someone else may have replaced the file.
 */
export interface UnencryptedCopy {
  fileName: string;
  /** `load` replaces the document (and turns encryption off); `merge` merges its changes in. */
  action: 'load' | 'merge';
  resolve: (proceed: boolean) => void;
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
  /** Set while the open file is encrypted (the key never leaves memory / IndexedDB). */
  encryption: EncryptionInfo | null;
  locked: Locked | null;
  unencryptedCopy: UnencryptedCopy | null;
  /** Size in bytes of the open document as it is (or would be) saved, encryption included. */
  fileSize: number | null;
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
  encryption: null,
  locked: null,
  unencryptedCopy: null,
  fileSize: null,
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

// ── Codec (encryption) ────────────────────────────────────────────────────────

/** Model → storage bytes (encrypted when encryption is on). */
async function encodeForStorage(model: DocModel): Promise<Uint8Array> {
  const plain = await io.encode(model);
  const { encryption } = get();
  return encryption ? encryptFile(plain, model.meta.fileId, encryption) : plain;
}

/**
 * Storage bytes → plaintext, using the current key or one remembered on this device.
 * Returns null (with `envelope`) when the passphrase is needed.
 */
async function unwrap(
  bytes: Uint8Array,
): Promise<{ plain: Uint8Array; encryption: EncryptionInfo | null } | { envelope: Envelope }> {
  const envelope = readEnvelope(bytes);
  if (!envelope) return { plain: bytes, encryption: null };
  const salt = envelopeSalt(envelope);
  const candidates: EncryptionInfo[] = [];
  const current = get().encryption;
  if (current) candidates.push(current);
  const stored = await workingCopyStore.loadKey(envelope.fileId).catch(() => undefined);
  if (stored) candidates.push(stored);
  for (const info of candidates) {
    try {
      const plain = await decryptFile(envelope, info.key);
      return { plain, encryption: { key: info.key, salt, iterations: envelope.kdf.iterations } };
    } catch {
      // try the next key
    }
  }
  return { envelope };
}

/** Decodes storage bytes, asking for the passphrase if needed; calls `onLoaded` with the result. */
async function decodeStorage(
  bytes: Uint8Array,
  fileName: string,
  onLoaded: (plain: Uint8Array, encryption: EncryptionInfo | null) => Promise<void>,
): Promise<void> {
  const result = await unwrap(bytes);
  if ('plain' in result) {
    await onLoaded(result.plain, result.encryption);
    return;
  }
  set({ locked: { fileName, envelope: result.envelope, resume: onLoaded } });
}

// ── Unencrypted copies of an encrypted file ──────────────────────────────────

/**
 * Whether loading `fileId` unencrypted would turn encryption off for the open file. An
 * encrypted file must never become unencrypted without the user saying so: anyone who can
 * write the file (e.g. with access to the user's Dropbox) could otherwise replace it with
 * an unencrypted copy and have every later save written in the clear.
 */
function dropsEncryption(fileId: string): boolean {
  return get().encryption !== null && docStore.getState().doc?.meta.fileId === fileId;
}

function isEncryptedBytes(bytes: Uint8Array): boolean {
  try {
    return readEnvelope(bytes) !== null;
  } catch {
    return true; // a damaged envelope is still not a plaintext file
  }
}

/** Asks whether to go ahead with an unencrypted copy of the open encrypted file. */
function confirmUnencryptedCopy(fileName: string, action: UnencryptedCopy['action']) {
  get().unencryptedCopy?.resolve(false);
  return new Promise<boolean>((resolve) => {
    set({
      unencryptedCopy: {
        fileName,
        action,
        resolve: (proceed) => {
          set({ unencryptedCopy: null });
          resolve(proceed);
        },
      },
    });
  });
}

/**
 * The user kept the encrypted document instead of an unencrypted copy. If that copy is the
 * open file's own storage, the next save overwrites it, encrypted again.
 */
function keepEncrypted(opened: OpenedFile, remoteRevision: number) {
  const { source } = get();
  const sameFile =
    source !== null &&
    source.kind === opened.descriptor.kind &&
    source.name === opened.descriptor.name &&
    source.path === opened.descriptor.path;
  set({ status: 'ready' });
  if (!sameFile) return;
  set({
    baseVersion: opened.version,
    baseRevision: Math.max(get().baseRevision, remoteRevision),
  });
  docStore.getState().markDirty();
  addNotice({
    kind: 'encryption',
    message: 'Kept your encrypted version. Save to replace the unencrypted file with it.',
  });
}

// ── Working copy ──────────────────────────────────────────────────────────────

let workingCopyTimer: ReturnType<typeof setTimeout> | undefined;
let workingCopyWrite: Promise<void> = Promise.resolve();

/** Writes the working copy now (serialized so writes never interleave). */
function flushWorkingCopy(): Promise<void> {
  clearTimeout(workingCopyTimer);
  workingCopyTimer = undefined;
  workingCopyWrite = workingCopyWrite.then(async () => {
    const { doc } = docStore.getState();
    if (!doc) return;
    const { source, baseRevision, baseVersion } = get();
    const bytes = await encodeForStorage(doc);
    set({ fileSize: bytes.length });
    await workingCopyStore.save({
      bytes,
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
    if (
      state.doc &&
      (state.editSeq !== prev.editSeq || state.savedContentId !== prev.savedContentId)
    ) {
      scheduleWorkingCopy();
    }
  });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      // Flush promptly when the page is hidden or closed (mobile browsers may not return).
      if (document.visibilityState === 'hidden' && workingCopyTimer) void flushWorkingCopy();
      // Back in view: see whether another device changed the file meanwhile.
      if (document.visibilityState === 'visible') void session.checkForChanges();
    });
    // Mobile browsers and installed apps don't always report a resume as a visibility change:
    // also check when the page is restored from the back/forward cache, regains focus, or
    // comes back online (a check made while offline fails).
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) void session.checkForChanges();
    });
    window.addEventListener('focus', () => void session.checkForChanges());
    window.addEventListener('online', () => void session.checkForChanges());
  }
}

/** The check in progress, so overlapping triggers (focus + visibility) share one request. */
let changeCheck: Promise<void> | null = null;
let changeCheckRetry: ReturnType<typeof setTimeout> | undefined;
const CHANGE_CHECK_RETRY_MS = 5000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function openDocument(
  doc: DocModel,
  sessionPatch: Partial<SessionState>,
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
    ...sessionPatch,
  });
  void flushWorkingCopy();
  // Copies of a previously open file aren't needed any more.
  void workingCopyStore.pruneBases(doc.meta.fileId).catch((err: unknown) => {
    console.warn('Could not remove old merge bases', err);
  });
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

async function rememberBase(fileId: string, bytes: Uint8Array) {
  await workingCopyStore.saveBase(fileId, bytes).catch((err: unknown) => {
    console.warn('Could not keep the merge base', err);
  });
}

/**
 * Rewrites the stored merge base for a new encryption setting, so no copy is left behind in
 * the old form (e.g. plaintext after encryption is turned on). Call before switching keys.
 */
async function rewrapBase(fileId: string, next: EncryptionInfo | null) {
  try {
    const bytes = await workingCopyStore.loadBase(fileId);
    if (!bytes) return;
    const result = await unwrap(bytes);
    if (!('plain' in result)) {
      await workingCopyStore.deleteBase(fileId); // unreadable: no use for merging anyway
      return;
    }
    await workingCopyStore.saveBase(
      fileId,
      next ? await encryptFile(result.plain, fileId, next) : result.plain,
    );
  } catch (err) {
    console.warn('Could not rewrite the merge base', err);
    await workingCopyStore.deleteBase(fileId).catch(() => undefined);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Loads bytes that were just opened from storage into the app (unlocking if needed). */
async function loadOpened(opened: OpenedFile): Promise<void> {
  await decodeStorage(opened.bytes, opened.descriptor.name, async (plain, encryption) => {
    const result = await io.decode(plain);
    if (!result.ok) {
      failOpen(opened.descriptor.name, result.error);
      return;
    }
    const { model, migrated, originalVersion, integrityIssues } = result;
    if (
      encryption === null &&
      dropsEncryption(model.meta.fileId) &&
      !(await confirmUnencryptedCopy(opened.descriptor.name, 'load'))
    ) {
      keepEncrypted(opened, model.meta.revision);
      return;
    }
    set({ encryption });
    openDocument(
      model,
      { source: opened.descriptor, baseVersion: opened.version },
      { dirty: migrated.length > 0 },
    );
    await rememberFile(model.meta.fileId, opened);
    await rememberBase(model.meta.fileId, opened.bytes);
    if (migrated.length > 0) {
      addNotice({
        kind: 'migrated',
        fromVersion: originalVersion,
        fileName: opened.descriptor.name,
        originalBytes: opened.bytes,
      });
    }
    if (integrityIssues.length > 0) addNotice({ kind: 'integrity', issues: integrityIssues });
  });
}

function failOpen(fileName: string, error: LoadError | string) {
  const message = typeof error === 'string' ? error : describeLoadError(error);
  if (docStore.getState().doc) {
    set({ status: 'ready' });
    addNotice({ kind: 'error', title: `Couldn't open ${displayFileName(fileName)}`, message });
  } else {
    set({ status: 'empty', loadError: { fileName, message } });
  }
}

function suggestedName(): string {
  const name = get().source?.name;
  return name ?? `Transact ${today()}${FILE_EXTENSION}`;
}

/** Identifying metadata of storage bytes (decrypting with known keys if needed). */
async function inspect(bytes: Uint8Array) {
  const result = await unwrap(bytes);
  if (!('plain' in result))
    return { fileId: result.envelope.fileId, revision: null, savedAt: null };
  return io.peekHeader(result.plain);
}

/** Decodes storage bytes to a model using known keys; null if it can't be read. */
async function decodeModel(bytes: Uint8Array): Promise<DocModel | null> {
  const result = await unwrap(bytes);
  if (!('plain' in result)) return null;
  const decoded = await io.decode(result.plain);
  return decoded.ok ? decoded.model : null;
}

/** Opens file bytes, or records a clash if they conflict with unsaved local edits. */
async function openFromStorage(opened: OpenedFile): Promise<void> {
  const { doc } = docStore.getState();
  const header = await inspect(opened.bytes);
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
        remoteVersion: opened.version,
        remoteRevision: header.revision,
        remoteSavedAt: header.savedAt,
        opened,
      },
    });
    return;
  }
  set({ status: 'loading' });
  await loadOpened(opened);
}

/**
 * If the open file changed elsewhere (another device saved it), loads the new version when
 * there are no local edits, or offers to merge when there are. A failed check (e.g. the
 * network isn't back yet after the app resumes) is retried once a few seconds later.
 */
async function checkForChanges(retry = true): Promise<void> {
  clearTimeout(changeCheckRetry);
  const { source, baseVersion, saving, conflict, status, locked, unencryptedCopy } = get();
  const { doc } = docStore.getState();
  if (!doc || !source || saving || conflict || locked || unencryptedCopy) return;
  if (status !== 'ready') return;
  const adapter = adapterFor(source.kind);
  if (!adapter.peekVersion) return;
  const handle = await workingCopyStore.loadHandle(doc.meta.fileId);
  try {
    const version = await adapter.peekVersion(handle, source);
    const unchanged =
      version === null ||
      (version.rev !== undefined
        ? version.rev === baseVersion.rev
        : version.lastModified === baseVersion.lastModified);
    if (unchanged || !adapter.reopen) return;
    const opened = await adapter.reopen(handle, source);
    if (!opened) return;
    const header = await inspect(opened.bytes);
    if (header.revision === get().baseRevision) {
      set({ baseVersion: opened.version }); // touched but not changed
      return;
    }
    if (!selectIsDirty(docStore.getState())) {
      await loadOpened(opened);
      addNotice({ kind: 'reloaded', savedAt: header.savedAt });
      return;
    }
    set({
      conflict: {
        origin: 'open',
        remoteBytes: opened.bytes,
        remoteVersion: opened.version,
        remoteRevision: header.revision,
        remoteSavedAt: header.savedAt,
        opened,
      },
    });
  } catch (err) {
    console.warn('Could not check for changes', err);
    if (retry) {
      changeCheckRetry = setTimeout(() => {
        if (changeCheck) return;
        changeCheck = checkForChanges(false).finally(() => {
          changeCheck = null;
        });
      }, CHANGE_CHECK_RETRY_MS);
    }
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────

export const session = {
  /** Restores the working copy (if any) on app start. */
  boot: async (): Promise<void> => {
    subscribeToEdits();
    const signIn = await completeDropboxSignIn().then(
      (connected) => ({ connected, error: null }),
      (err: unknown) => ({ connected: false, error: errorMessage(err) }),
    );
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
      await decodeStorage(
        copy.bytes,
        copy.source?.name ?? 'Unsaved working copy',
        async (plain, encryption) => {
          const result = await io.decode(plain);
          if (!result.ok) {
            set({
              status: 'empty',
              loadError: {
                fileName: 'Unsaved working copy',
                message: describeLoadError(result.error),
              },
            });
            return;
          }
          docStore
            .getState()
            .load(result.model, { dirty: copy.dirty || result.migrated.length > 0 });
          set({
            status: 'ready',
            encryption,
            source: copy.source,
            baseRevision: copy.baseRevision,
            baseVersion: copy.baseVersion,
            lastSavedAt: result.model.meta.savedAt,
            fileSize: copy.bytes.length,
          });
          if (copy.dirty) addNotice({ kind: 'restored', updatedAt: copy.updatedAt });
          // The file may have changed elsewhere while the app was closed.
          void session.checkForChanges();
        },
      );
      // Waiting for a passphrase: show the welcome screen behind the unlock dialog.
      if (get().locked && get().status === 'booting') set({ status: 'empty' });
    } catch (err) {
      console.error('Failed to restore working copy', err);
      set({ status: 'empty' });
    }
    if (signIn.error) addNotice({ kind: 'error', title: 'Dropbox', message: signIn.error });
    else if (signIn.connected) addNotice({ kind: 'dropbox-connected' });
  },

  /** Opens a file from the Dropbox app folder. */
  openFromDropbox: async (path: string): Promise<void> => {
    set({ status: 'loading' });
    try {
      await session.openFromStorage(await downloadDropboxFile(path));
    } catch (err) {
      failOpen(path.replace(/^\//, ''), errorMessage(err));
    }
    if (get().status === 'loading') set({ status: docStore.getState().doc ? 'ready' : 'empty' });
  },

  /** Unlocks the pending encrypted file. Throws WrongPassphraseError on a wrong passphrase. */
  unlock: async (passphrase: string, remember: boolean): Promise<void> => {
    const locked = get().locked;
    if (!locked) return;
    const salt = envelopeSalt(locked.envelope);
    const key = await deriveKey(passphrase, salt, locked.envelope.kdf.iterations);
    const plain = await decryptFile(locked.envelope, key);
    const encryption: EncryptionInfo = { key, salt, iterations: locked.envelope.kdf.iterations };
    if (remember) await workingCopyStore.saveKey(locked.envelope.fileId, encryption);
    set({ locked: null });
    await locked.resume(plain, encryption);
  },

  cancelUnlock: (): void => {
    set({ locked: null, status: docStore.getState().doc ? 'ready' : 'empty' });
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
    set({ encryption: null });
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
    try {
      await openFromStorage(opened);
    } catch (err) {
      failOpen(opened.descriptor.name, errorMessage(err));
    }
  },

  /** Reopens the most recently used file via its stored handle or path. */
  reopenRecent: async (): Promise<void> => {
    const recent = get().recent;
    if (!recent) return;
    const adapter = adapterFor(recent.source.kind);
    const handle = await workingCopyStore.loadHandle(recent.fileId);
    if (!adapter.reopen || (!handle && recent.source.kind !== 'dropbox')) {
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

  /**
   * If the open file changed elsewhere (another device saved it), load the new version
   * when there are no local edits, or offer to merge when there are.
   */
  checkForChanges: (): Promise<void> => {
    if (!changeCheck) {
      changeCheck = checkForChanges().finally(() => {
        changeCheck = null;
      });
    }
    return changeCheck;
  },

  /** Saves to the current file, or prompts for a location if there isn't one. */
  save: async (
    options: { saveAs?: boolean; force?: boolean; name?: string; target?: AdapterKind } = {},
  ): Promise<void> => {
    const { doc, contentId } = docStore.getState();
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
      const bytes = await encodeForStorage({ ...doc, meta });

      const { source, baseVersion } = get();
      const handle = source ? await workingCopyStore.loadHandle(doc.meta.fileId) : undefined;
      const adapter =
        source && !options.saveAs
          ? adapterFor(source.kind)
          : options.target
            ? adapterFor(options.target)
            : preferredAdapter();
      const canWriteBack =
        source &&
        !options.saveAs &&
        (source.kind === 'download' || source.kind === 'dropbox' || handle !== undefined);
      const result = canWriteBack
        ? await adapter.save(bytes, {
            handle,
            descriptor: source,
            base: baseVersion,
            ...(options.force ? { force: true } : {}),
          })
        : await adapter.saveAs(bytes, options.name ?? suggestedName());

      if (!result.ok) {
        if (result.reason === 'changed') {
          const header = await inspect(result.remoteBytes);
          // Only the timestamp changed (e.g. touched by a sync tool): safe to overwrite.
          if (header.fileId === doc.meta.fileId && header.revision === get().baseRevision) {
            set({ saving: false, baseVersion: result.version ?? baseVersion });
            await session.save({ ...options, force: !result.version });
            return;
          }
          set({
            conflict: {
              origin: 'save',
              remoteBytes: result.remoteBytes,
              remoteVersion: result.version ?? {},
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
      docStore.getState().markSaved(contentId);
      set({
        source: result.descriptor,
        baseVersion: result.version,
        baseRevision: meta.revision,
        lastSavedAt: now,
        conflict: null,
        notices: get().notices.filter(
          (n) => n.kind !== 'restored' && n.kind !== 'migrated' && n.kind !== 'encryption',
        ),
      });
      await rememberFile(doc.meta.fileId, result);
      await rememberBase(doc.meta.fileId, bytes);
      await flushWorkingCopy();
    } catch (err) {
      addNotice({ kind: 'error', title: 'Save failed', message: errorMessage(err) });
    } finally {
      set({ saving: false });
    }
  },

  /** Resolves a conflict between local edits and a file changed elsewhere. */
  resolveConflict: async (
    choice: 'merge' | 'keep-mine' | 'take-theirs' | 'save-copy',
  ): Promise<void> => {
    const conflict = get().conflict;
    if (!conflict) return;
    set({ conflict: null });
    switch (choice) {
      case 'merge': {
        const local = docStore.getState().doc;
        if (!local) return;
        // An unencrypted copy of an encrypted file isn't protected against tampering:
        // don't merge its changes in unless the user knows about it.
        if (
          get().encryption !== null &&
          !isEncryptedBytes(conflict.remoteBytes) &&
          !(await confirmUnencryptedCopy(get().source?.name ?? suggestedName(), 'merge'))
        ) {
          set({ conflict });
          return;
        }
        const remote = await decodeModel(conflict.remoteBytes);
        if (!remote || remote.meta.fileId !== local.meta.fileId) {
          addNotice({
            kind: 'error',
            title: 'Couldn’t merge',
            message:
              'The other version couldn’t be read (or is a different file). Choose another option.',
          });
          set({ conflict });
          return;
        }
        const baseBytes = await workingCopyStore.loadBase(local.meta.fileId);
        const base = baseBytes ? await decodeModel(baseBytes) : null;
        const { merged, conflicts, fromRemote } = mergeDocuments(base, local, remote);
        docStore.getState().load(merged, { dirty: true });
        // Save on top of the other version: continue its revision numbering.
        set({
          baseRevision: Math.max(remote.meta.revision, local.meta.revision),
          baseVersion: conflict.remoteVersion,
        });
        await rememberBase(local.meta.fileId, conflict.remoteBytes);
        addNotice({ kind: 'merged', fromRemote, conflicts });
        await session.save({ force: conflict.remoteVersion.rev === undefined });
        break;
      }
      case 'keep-mine':
        // Overwrite the other version, continuing its revision numbering.
        set({
          baseRevision: Math.max(get().baseRevision, conflict.remoteRevision ?? 0),
          baseVersion: conflict.remoteVersion,
        });
        if (conflict.origin === 'save') await session.save({ force: true });
        break;
      case 'take-theirs': {
        const opened: OpenedFile = conflict.opened ?? {
          bytes: conflict.remoteBytes,
          descriptor: get().source ?? { kind: 'download', name: suggestedName() },
          version: conflict.remoteVersion,
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

  // ── Encryption ──

  /** Turns on encryption (or changes the passphrase). Takes effect on the next save. */
  setPassphrase: async (passphrase: string, remember: boolean): Promise<void> => {
    const doc = docStore.getState().doc;
    if (!doc) return;
    const salt = randomSalt();
    const key = await deriveKey(passphrase, salt, DEFAULT_ITERATIONS);
    const encryption: EncryptionInfo = { key, salt, iterations: DEFAULT_ITERATIONS };
    const wasEncrypted = get().encryption !== null;
    await rewrapBase(doc.meta.fileId, encryption);
    set({ encryption });
    if (remember) await workingCopyStore.saveKey(doc.meta.fileId, encryption);
    else await workingCopyStore.deleteKey(doc.meta.fileId);
    docStore.getState().markDirty();
    // Replace the working copy now, so it isn't left in the old form until the next edit.
    await flushWorkingCopy();
    addNotice({
      kind: 'encryption',
      message: wasEncrypted
        ? 'Passphrase changed. Save to write the file with the new passphrase.'
        : 'Encryption is on. Save to write the encrypted file; until then the file on disk is unchanged.',
    });
  },

  /** Turns off encryption. Takes effect on the next save. */
  disableEncryption: async (): Promise<void> => {
    const doc = docStore.getState().doc;
    if (!doc || !get().encryption) return;
    await rewrapBase(doc.meta.fileId, null);
    set({ encryption: null });
    await workingCopyStore.deleteKey(doc.meta.fileId);
    docStore.getState().markDirty();
    // Without the key, an encrypted working copy couldn't be restored: rewrite it now.
    await flushWorkingCopy();
    addNotice({
      kind: 'encryption',
      message: 'Encryption is off. Save to write the file unencrypted.',
    });
  },

  /** Forgets this file's remembered key on this device (the passphrase will be asked again). */
  forgetKey: async (): Promise<void> => {
    const doc = docStore.getState().doc;
    if (doc) await workingCopyStore.deleteKey(doc.meta.fileId);
  },

  /** Closes the document and discards the working copy. Callers confirm unsaved changes first. */
  close: async (): Promise<void> => {
    clearTimeout(workingCopyTimer);
    workingCopyTimer = undefined;
    await workingCopyWrite;
    docStore.getState().unload();
    get().unencryptedCopy?.resolve(false);
    set({ ...initialState, status: 'empty', recent: get().recent });
    await workingCopyStore.remove();
    // The merge base is a full copy of the file: don't leave it behind.
    await workingCopyStore.pruneBases();
  },

  /** Writes pending changes to the working copy immediately. */
  flush: (): Promise<void> => flushWorkingCopy(),

  dismissNotice: (kind: Notice['kind']): void => {
    set({ notices: get().notices.filter((n) => n.kind !== kind) });
  },

  /**
   * Removes all data Transact keeps in this browser (working copy, handles, keys, preferences)
   * and disconnects Dropbox. Resolves false if Dropbox access couldn't be revoked.
   */
  clearLocalData: async (): Promise<boolean> => {
    const revoked = await disconnectDropbox();
    await session.close();
    await workingCopyStore.clearAll();
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('transact:')) localStorage.removeItem(key);
    }
    setDropboxAppKey('');
    dropboxState.setState({ connected: false });
    set({ recent: null });
    return revoked;
  },
};

/**
 * File System Access adapter (Chromium desktop): opens a real file on disk and writes
 * changes back to it. The FileSystemFileHandle is persisted in IndexedDB so the same
 * file can be saved again after a reload (the browser re-asks for permission).
 */
import type { OpenedFile, SaveResult, SourceDescriptor, StorageAdapter } from '../types';

const PICKER_TYPES: FilePickerAcceptType[] = [
  { description: 'Transact data file', accept: { 'application/json': ['.json', '.transact'] } },
];

export function isFsAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

async function ensurePermission(handle: FileSystemFileHandle, mode: 'read' | 'readwrite') {
  if ((await handle.queryPermission?.({ mode })) === 'granted') return true;
  return (await handle.requestPermission?.({ mode })) === 'granted';
}

async function read(handle: FileSystemFileHandle): Promise<OpenedFile> {
  const file = await handle.getFile();
  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    descriptor: { kind: 'fs-access', name: file.name },
    version: { lastModified: file.lastModified },
    handle,
  };
}

async function write(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<SaveResult> {
  const writable = await handle.createWritable();
  await writable.write(bytes as Uint8Array<ArrayBuffer>);
  await writable.close();
  const file = await handle.getFile();
  return {
    ok: true,
    version: { lastModified: file.lastModified },
    descriptor: { kind: 'fs-access', name: file.name },
    handle,
  };
}

export const fsAccessAdapter: StorageAdapter = {
  kind: 'fs-access',
  capabilities: { writeBack: true },

  async open() {
    try {
      if (!window.showOpenFilePicker) return null;
      const [handle] = await window.showOpenFilePicker({ types: PICKER_TYPES, id: 'transact' });
      return handle ? await read(handle) : null;
    } catch (err) {
      if (isAbort(err)) return null;
      throw err;
    }
  },

  async reopen(handle: unknown, _descriptor: SourceDescriptor) {
    const h = handle as FileSystemFileHandle;
    if (!(await ensurePermission(h, 'read'))) return null;
    return read(h);
  },

  async peekVersion(handle: unknown) {
    const h = handle as FileSystemFileHandle | undefined;
    if (!h || (await h.queryPermission?.({ mode: 'read' })) !== 'granted') return null;
    return { lastModified: (await h.getFile()).lastModified };
  },

  async save(bytes, { handle, base, force }) {
    const h = handle as FileSystemFileHandle;
    try {
      if (!(await ensurePermission(h, 'readwrite'))) {
        return { ok: false, reason: 'failed', message: 'Permission to write the file was denied.' };
      }
      if (!force) {
        const current = await h.getFile();
        if (base.lastModified !== undefined && current.lastModified !== base.lastModified) {
          return {
            ok: false,
            reason: 'changed',
            remoteBytes: new Uint8Array(await current.arrayBuffer()),
            version: { lastModified: current.lastModified },
          };
        }
      }
      return await write(h, bytes);
    } catch (err) {
      return {
        ok: false,
        reason: 'failed',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async saveAs(bytes, suggestedName) {
    try {
      if (!window.showSaveFilePicker) {
        return { ok: false, reason: 'failed', message: 'Saving to files is not supported.' };
      }
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: PICKER_TYPES,
        id: 'transact',
      });
      return await write(handle, bytes);
    } catch (err) {
      if (isAbort(err)) return { ok: false, reason: 'cancelled' };
      return {
        ok: false,
        reason: 'failed',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

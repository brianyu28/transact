/**
 * Fallback adapter for browsers without the File System Access API (Safari, Firefox,
 * mobile): opens via a file input and saves by downloading a new copy, or on touch
 * devices via the share sheet ("Save to Files"). It can't detect changes made elsewhere
 * at save time; the session compares revisions when files are opened instead.
 */
import type { OpenedFile, SaveResult, StorageAdapter } from '../types';

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.transact,application/json';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
    });
    input.addEventListener('cancel', () => {
      resolve(null);
    });
    input.click();
  });
}

async function deliver(bytes: Uint8Array, name: string): Promise<SaveResult> {
  const file = new File([bytes as Uint8Array<ArrayBuffer>], name, { type: 'application/json' });
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (coarse && 'canShare' in navigator && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError')
        return { ok: false, reason: 'cancelled' };
      throw err;
    }
  } else {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10_000);
  }
  return { ok: true, version: {}, descriptor: { kind: 'download', name } };
}

export const downloadAdapter: StorageAdapter = {
  kind: 'download',
  capabilities: { writeBack: false },

  async open(): Promise<OpenedFile | null> {
    const file = await pickFile();
    if (!file) return null;
    return {
      bytes: new Uint8Array(await file.arrayBuffer()),
      descriptor: { kind: 'download', name: file.name },
      version: { lastModified: file.lastModified },
    };
  },

  save(bytes, { descriptor }) {
    return deliver(bytes, descriptor.name);
  },

  saveAs(bytes, suggestedName) {
    return deliver(bytes, suggestedName);
  },
};

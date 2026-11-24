/**
 * Storage adapters move opaque bytes between the app and somewhere the user keeps their
 * file. They know nothing about JSON, schemas or encryption (that's the codec's job), so
 * new backends (e.g. a cloud drive) only need to implement this interface.
 */
export type AdapterKind = 'fs-access' | 'download';

/** Where the open document came from, persisted with the working copy. */
export interface SourceDescriptor {
  kind: AdapterKind;
  /** File name shown to the user. */
  name: string;
}

/**
 * Adapter-specific marker of the file version that was last read or written, used to
 * detect changes made elsewhere before overwriting.
 */
export interface VersionToken {
  lastModified?: number;
}

export interface OpenedFile {
  bytes: Uint8Array;
  descriptor: SourceDescriptor;
  version: VersionToken;
  /** Adapter-specific handle to persist for reopening/saving (e.g. a FileSystemFileHandle). */
  handle?: unknown;
}

export type SaveResult =
  | { ok: true; version: VersionToken; descriptor: SourceDescriptor; handle?: unknown }
  /** The file changed since `base`; `remoteBytes` is its current content. */
  | { ok: false; reason: 'changed'; remoteBytes: Uint8Array }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'failed'; message: string };

export interface StorageAdapter {
  kind: AdapterKind;
  capabilities: {
    /** Can write back to the same file (otherwise every save is a download). */
    writeBack: boolean;
  };
  /** Prompts the user to pick a file. Resolves null if cancelled. */
  open(): Promise<OpenedFile | null>;
  /** Re-reads a previously opened file from its persisted handle. */
  reopen?(handle: unknown, descriptor: SourceDescriptor): Promise<OpenedFile | null>;
  /** Saves to the existing file. `force` skips the change check. */
  save(
    bytes: Uint8Array,
    target: { handle: unknown; descriptor: SourceDescriptor; base: VersionToken; force?: boolean },
  ): Promise<SaveResult>;
  /** Prompts for a new location/name and saves there. */
  saveAs(bytes: Uint8Array, suggestedName: string): Promise<SaveResult>;
}

export const FILE_EXTENSION = '.transact.json';

import type { AdapterKind, StorageAdapter } from '../types';
import { downloadAdapter } from './download';
import { dropboxAdapter } from './dropbox';
import { fsAccessAdapter, isFsAccessSupported } from './fsAccess';

export function adapterFor(kind: AdapterKind): StorageAdapter {
  switch (kind) {
    case 'fs-access':
      return fsAccessAdapter;
    case 'dropbox':
      return dropboxAdapter;
    case 'download':
      return downloadAdapter;
  }
}

/** The best local-file adapter this browser supports. */
export function preferredAdapter(): StorageAdapter {
  return isFsAccessSupported() ? fsAccessAdapter : downloadAdapter;
}

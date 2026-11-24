import type { AdapterKind, StorageAdapter } from '../types';
import { downloadAdapter } from './download';
import { fsAccessAdapter, isFsAccessSupported } from './fsAccess';

export function adapterFor(kind: AdapterKind): StorageAdapter {
  return kind === 'fs-access' ? fsAccessAdapter : downloadAdapter;
}

/** The best adapter this browser supports. */
export function preferredAdapter(): StorageAdapter {
  return isFsAccessSupported() ? fsAccessAdapter : downloadAdapter;
}

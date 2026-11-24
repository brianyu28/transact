/**
 * Codec: document model ⇄ file bytes. Today that's UTF-8 JSON; encryption will wrap
 * this layer later (an encrypted envelope is already detected by the loader).
 */
import type { DocModel } from '@/domain/model';
import { parseDocument, type LoadResult } from '@/domain/schema/document';
import { decodeText, encodeText, serializeModel } from './serialize';

export function decodeDocument(bytes: Uint8Array): LoadResult {
  return parseDocument(decodeText(bytes));
}

export function encodeDocument(model: DocModel): Uint8Array {
  return encodeText(serializeModel(model));
}

export interface FileHeader {
  fileId: string | null;
  revision: number | null;
  savedAt: string | null;
}

/** Reads just the identifying metadata of a file (for conflict checks), without validating it. */
export function peekHeader(bytes: Uint8Array): FileHeader {
  try {
    const raw = JSON.parse(decodeText(bytes)) as { meta?: Record<string, unknown> };
    const meta = raw.meta ?? {};
    return {
      fileId: typeof meta.fileId === 'string' ? meta.fileId : null,
      revision: typeof meta.revision === 'number' ? meta.revision : null,
      savedAt: typeof meta.savedAt === 'string' ? meta.savedAt : null,
    };
  } catch {
    return { fileId: null, revision: null, savedAt: null };
  }
}

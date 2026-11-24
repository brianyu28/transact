/**
 * Serializes a data file as readable, diff-friendly JSON: objects are pretty-printed,
 * but arrays of records are written one record per line (compact). This keeps large
 * files reasonably small while still being easy to read and diff.
 *
 *   {
 *     "format": "transact",
 *     "transactions": [
 *       {"id":"txn_…","accountId":"acc_…","date":"2026-11-24","payee":"Grocer","amount":-4210},
 *       …
 *     ]
 *   }
 */
import { modelToFile, type DocModel } from '@/domain/model';
import type { TransactFile } from '@/domain/schema/types';

export function serializeFile(file: TransactFile): string {
  return write(file, '') + '\n';
}

export function serializeModel(model: DocModel): string {
  return serializeFile(modelToFile(model));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function write(value: unknown, indent: string): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const inner = indent + '  ';
    // Arrays of records: one compact record per line. Other arrays: inline.
    if (value.every(isPlainObject)) {
      return `[\n${value.map((v) => inner + JSON.stringify(v)).join(',\n')}\n${indent}]`;
    }
    return JSON.stringify(value);
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    const inner = indent + '  ';
    const body = entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${write(v, inner)}`);
    return `{\n${body.join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeText(text: string): Uint8Array {
  return encoder.encode(text);
}

export function decodeText(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

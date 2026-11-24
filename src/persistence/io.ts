/**
 * Client for the I/O worker. Falls back to running the codec on the main thread where
 * Web Workers aren't available (e.g. unit tests).
 */
import type { DocModel } from '@/domain/model';
import type { LoadResult } from '@/domain/schema/document';
import type { FileHeader } from './codec';

// Imported lazily so the codec (and zod) stay out of the main bundle; it normally runs in the worker.
const codec = () => import('./codec');

export type IoRequest =
  | { id: number; type: 'decode'; bytes: Uint8Array }
  | { id: number; type: 'encode'; model: DocModel }
  | { id: number; type: 'peekHeader'; bytes: Uint8Array };

export type IoResponse =
  { id: number; ok: true; result: unknown } | { id: number; ok: false; message: string };

type Pending = { resolve: (value: unknown) => void; reject: (err: Error) => void };

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === 'undefined') return (worker = null);
  worker = new Worker(new URL('../workers/io.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<IoResponse>) => {
    const res = event.data;
    const p = pending.get(res.id);
    if (!p) return;
    pending.delete(res.id);
    if (res.ok) p.resolve(res.result);
    else p.reject(new Error(res.message));
  };
  // A crashed worker must not leave callers waiting forever.
  const failAll = (message: string) => {
    for (const p of pending.values()) p.reject(new Error(message));
    pending.clear();
  };
  worker.onerror = (event) => {
    failAll(`The file worker failed: ${event.message}`);
  };
  worker.onmessageerror = () => {
    failAll('The file worker sent an unreadable message.');
  };
  return worker;
}

type RequestBody = IoRequest extends infer R
  ? R extends IoRequest
    ? Omit<R, 'id'>
    : never
  : never;

function call<T>(body: RequestBody, inline: () => Promise<T>): Promise<T> {
  const w = getWorker();
  if (!w) return inline();
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ ...body, id });
  });
}

export const io = {
  decode: (bytes: Uint8Array) =>
    call<LoadResult>({ type: 'decode', bytes }, async () => (await codec()).decodeDocument(bytes)),
  encode: (model: DocModel) =>
    call<Uint8Array>({ type: 'encode', model }, async () => (await codec()).encodeDocument(model)),
  peekHeader: (bytes: Uint8Array) =>
    call<FileHeader>({ type: 'peekHeader', bytes }, async () => (await codec()).peekHeader(bytes)),
};

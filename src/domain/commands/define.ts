/**
 * Commands are the only way the UI changes a document. Each is a named, pure function
 * that mutates an Immer draft; the store records the resulting patches for undo/redo
 * and incremental index updates.
 */
import type { Draft } from 'immer';
import type { IdKind } from '@/lib/id';
import type { DocModel } from '../model';
import type { Id } from '../schema/types';

export interface CommandContext {
  /** ISO timestamp for `updatedAt` / `createdAt` / tombstones. */
  now: string;
  newId: (kind: IdKind) => Id;
}

export interface CommandDef<P, R> {
  /** Human-readable label, shown e.g. as "Undo <label>". */
  label: string;
  run: (draft: Draft<DocModel>, payload: P, ctx: CommandContext) => R;
}

export function defineCommand<P, R = void>(def: CommandDef<P, R>): CommandDef<P, R> {
  return def;
}

/** Thrown for invalid commands (unknown ids, broken invariants). Leaves the document unchanged. */
export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandError';
  }
}

export function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new CommandError(`${what} not found`);
  return value;
}

/**
 * Applies a set of changes where `undefined` means "remove the field" (fields are
 * omitted rather than stored as defaults).
 */
export function applyChanges<T extends object>(
  target: T,
  changes: { [K in keyof T]?: T[K] | undefined },
): void {
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === false || (Array.isArray(value) && value.length === 0)) {
      Reflect.deleteProperty(target, key);
    } else {
      (target as Record<string, unknown>)[key] = value;
    }
  }
}

export function tombstone(draft: Draft<DocModel>, id: Id, now: string): void {
  draft.tombstones.push({ id, deletedAt: now });
}

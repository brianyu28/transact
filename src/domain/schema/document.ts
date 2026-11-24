/**
 * Load pipeline for document text:
 *   parse JSON → check format → version check → migrate → validate → integrity check.
 * Pure and synchronous so it can run in a Web Worker or in tests.
 */
import { fileToModel, type DocModel } from '../model';
import { checkIntegrity, type IntegrityIssue } from './integrity';
import { runMigrations, type JsonObject, type Migration } from './migrations';
import type { TransactFile } from './types';
import { TransactFileSchema } from './current';
import type { LoadError } from './loadError';
import { CURRENT_SCHEMA_VERSION, ENCRYPTED_FORMAT, FILE_FORMAT } from './version';

export type { LoadError } from './loadError';

export interface MigrationInfo {
  from: number;
  to: number;
  description: string;
}

export type LoadResult =
  | {
      ok: true;
      model: DocModel;
      /** Schema version of the file as stored (before migration). */
      originalVersion: number;
      /** Migrations applied (plain data, so results can cross the worker boundary). */
      migrated: MigrationInfo[];
      integrityIssues: IntegrityIssue[];
    }
  | { ok: false; error: LoadError };

const MAX_REPORTED_ISSUES = 20;

export function parseDocument(text: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: { kind: 'invalid-json', message: (err as Error).message } };
  }
  return loadRawDocument(raw);
}

export function loadRawDocument(raw: unknown): LoadResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: { kind: 'not-transact' } };
  }
  const obj = raw as JsonObject;
  if (obj.format === ENCRYPTED_FORMAT) return { ok: false, error: { kind: 'encrypted' } };
  if (obj.format !== FILE_FORMAT || typeof obj.schemaVersion !== 'number') {
    return { ok: false, error: { kind: 'not-transact' } };
  }

  const fileVersion = obj.schemaVersion;
  if (fileVersion > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: { kind: 'newer-version', fileVersion, supportedVersion: CURRENT_SCHEMA_VERSION },
    };
  }

  const migration = tryMigrate(obj, fileVersion);
  if ('error' in migration) {
    return { ok: false, error: { kind: 'migration-failed', message: migration.error } };
  }
  const { doc, applied: migrated } = migration;

  const parsed = TransactFileSchema.safeParse(doc);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, MAX_REPORTED_ISSUES)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    return { ok: false, error: { kind: 'invalid-schema', issues } };
  }

  const file: TransactFile = parsed.data;
  return {
    ok: true,
    model: fileToModel(file),
    originalVersion: fileVersion,
    migrated: migrated.map(({ from, to, description }) => ({ from, to, description })),
    integrityIssues: checkIntegrity(file),
  };
}

function tryMigrate(
  doc: JsonObject,
  fromVersion: number,
): { doc: JsonObject; applied: Migration[] } | { error: string } {
  try {
    return runMigrations(doc, fromVersion, CURRENT_SCHEMA_VERSION);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

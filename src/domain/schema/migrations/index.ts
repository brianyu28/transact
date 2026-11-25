/**
 * Schema migrations. Each migration upgrades a raw (already JSON-parsed) document by
 * exactly one version. To change the schema:
 *   1. Change `../current.ts` (the only schema module; old versions aren't kept as code).
 *   2. Add a single-step migration in its own file (e.g. v2-to-v3.ts) and list it below.
 *   3. Bump CURRENT_SCHEMA_VERSION in `../version.ts`.
 *   4. Add `fixtures/vN.json` (pnpm gen:demo); the fixture test migrates every older
 *      fixture forward and validates it.
 * Migrations operate on plain JSON (never on current types), so they keep working
 * as the codebase evolves.
 */
import { v1ToV2 } from './v1-to-v2';
import { v2ToV3 } from './v2-to-v3';
import { v3ToV4 } from './v3-to-v4';

export type JsonObject = Record<string, unknown>;

export interface Migration {
  from: number;
  to: number;
  description: string;
  migrate: (doc: JsonObject) => JsonObject;
}

/** Ordered list of all migrations. */
export const migrations: readonly Migration[] = [v1ToV2, v2ToV3, v3ToV4];

export class MigrationError extends Error {
  readonly fromVersion: number;

  constructor(message: string, fromVersion: number) {
    super(message);
    this.name = 'MigrationError';
    this.fromVersion = fromVersion;
  }
}

/**
 * Applies migrations from `fromVersion` up to `toVersion`. Each migration receives a
 * structured clone, so a failing migration can never corrupt the caller's data.
 */
export function runMigrations(
  doc: JsonObject,
  fromVersion: number,
  toVersion: number,
  list: readonly Migration[] = migrations,
): { doc: JsonObject; applied: Migration[] } {
  let current = doc;
  let version = fromVersion;
  const applied: Migration[] = [];
  while (version < toVersion) {
    const step = list.find((m) => m.from === version);
    if (!step || step.to !== version + 1) {
      throw new MigrationError(`No migration from schema v${version} to v${version + 1}`, version);
    }
    try {
      current = { ...step.migrate(structuredClone(current)), schemaVersion: step.to };
    } catch (err) {
      throw new MigrationError(
        `Migration v${step.from}→v${step.to} failed: ${err instanceof Error ? err.message : String(err)}`,
        version,
      );
    }
    applied.push(step);
    version = step.to;
  }
  return { doc: current, applied };
}

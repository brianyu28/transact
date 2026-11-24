/**
 * Schema migrations. Each migration upgrades a raw (already JSON-parsed) document by
 * exactly one version. To change the schema:
 *   1. Copy the current schema module (e.g. v1.ts → v2.ts) and make the change there.
 *   2. Add a migration `{ from: 1, to: 2, ... }` here (in a file of its own, e.g. v1-to-v2.ts).
 *   3. Bump CURRENT_SCHEMA_VERSION and point `types.ts` / `validate.ts` at the new schema.
 *   4. Add `fixtures/v2.json`; the fixture test migrates every older fixture forward.
 * Migrations operate on plain JSON (never on current types), so they keep working
 * as the codebase evolves.
 */
export type JsonObject = Record<string, unknown>;

export interface Migration {
  from: number;
  to: number;
  description: string;
  migrate: (doc: JsonObject) => JsonObject;
}

/** Ordered list of all migrations. Empty while v1 is the only schema. */
export const migrations: readonly Migration[] = [];

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

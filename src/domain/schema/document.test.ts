import { describe, expect, it } from 'vitest';
import { serializeModel } from '@/persistence/codec/serialize';
import { generateDemoDocument } from '../demo/generate';
import { countTransactions } from '../model';
import { parseDocument } from './document';
import { runMigrations, MigrationError, type Migration } from './migrations';
import { createEmptyDocument } from './defaults';
import { CURRENT_SCHEMA_VERSION } from './version';

const fixtures = import.meta.glob<string>('./fixtures/v*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const fixture = (version: number): string => {
  const text = fixtures[`./fixtures/v${version}.json`];
  if (text === undefined) throw new Error(`Missing fixture for schema v${version}`);
  return text;
};

describe('parseDocument', () => {
  it('loads every fixture, migrating older ones to the current version', () => {
    for (let v = 1; v <= CURRENT_SCHEMA_VERSION; v++) {
      const result = parseDocument(fixture(v));
      if (!result.ok) throw new Error(`v${v}: ${JSON.stringify(result.error)}`);
      expect(result.originalVersion).toBe(v);
      expect(result.integrityIssues).toEqual([]);
    }
  });

  it('round-trips the current fixture byte-for-byte', () => {
    const text = fixture(CURRENT_SCHEMA_VERSION);
    const result = parseDocument(text);
    if (!result.ok) throw new Error('fixture failed to load');
    expect(serializeModel(result.model)).toBe(text);
  });

  it('round-trips a new empty document', () => {
    const doc = createEmptyDocument({ appVersion: 'test' });
    const result = parseDocument(serializeModel(doc));
    expect(result.ok).toBe(true);
  });

  it('rejects files from a newer app version', () => {
    const text = JSON.stringify({ format: 'transact', schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
    expect(parseDocument(text)).toEqual({
      ok: false,
      error: {
        kind: 'newer-version',
        fileVersion: CURRENT_SCHEMA_VERSION + 1,
        supportedVersion: CURRENT_SCHEMA_VERSION,
      },
    });
  });

  it('recognizes non-Transact, invalid and encrypted files', () => {
    expect(parseDocument('{nope')).toMatchObject({ ok: false, error: { kind: 'invalid-json' } });
    expect(parseDocument('[1,2]')).toMatchObject({ ok: false, error: { kind: 'not-transact' } });
    expect(parseDocument('{"format":"other"}')).toMatchObject({
      ok: false,
      error: { kind: 'not-transact' },
    });
    expect(parseDocument('{"format":"transact-encrypted"}')).toMatchObject({
      ok: false,
      error: { kind: 'encrypted' },
    });
  });

  it('reports schema violations such as splits that do not add up', () => {
    const file = JSON.parse(fixture(CURRENT_SCHEMA_VERSION)) as {
      transactions: { amount: number; categoryId?: string; splits?: unknown[] }[];
    };
    const txn = file.transactions.find((t) => t.categoryId !== undefined);
    if (!txn) throw new Error('fixture has no categorized transaction');
    delete txn.categoryId;
    txn.splits = [
      { id: 'spl_aaaaaaaaaaaa', amount: txn.amount },
      { id: 'spl_bbbbbbbbbbbb', amount: 1 },
    ];
    const result = parseDocument(JSON.stringify(file));
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid-schema' } });
  });
});

describe('runMigrations', () => {
  const v0to1: Migration = {
    from: 0,
    to: 1,
    description: 'Rename txns → transactions',
    migrate: ({ txns, ...rest }) => ({ ...rest, transactions: txns }),
  };

  it('applies migrations step by step and stamps the version', () => {
    const { doc, applied } = runMigrations({ schemaVersion: 0, txns: [1] }, 0, 1, [v0to1]);
    expect(doc).toEqual({ schemaVersion: 1, transactions: [1] });
    expect(applied).toEqual([v0to1]);
  });

  it('never mutates the input', () => {
    const input = { schemaVersion: 0, txns: [{ a: 1 }] };
    const mutating: Migration = {
      ...v0to1,
      migrate: (d) => {
        (d.txns as { a: number }[])[0]!.a = 2;
        return d;
      },
    };
    runMigrations(input, 0, 1, [mutating]);
    expect(input.txns[0]!.a).toBe(1);
  });

  it('fails clearly when a step is missing', () => {
    expect(() => runMigrations({}, 0, 2, [v0to1])).toThrow(MigrationError);
  });
});

describe('generateDemoDocument', () => {
  it('is deterministic and produces valid, consistent data', () => {
    const opts = { endDate: '2026-06-30', years: 1, appVersion: 'test', seed: 3 };
    const a = serializeModel(generateDemoDocument(opts));
    expect(serializeModel(generateDemoDocument(opts))).toBe(a);
    const result = parseDocument(a);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.integrityIssues).toEqual([]);
    expect(countTransactions(result.model)).toBeGreaterThan(500);
  });
});

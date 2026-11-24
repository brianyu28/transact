/**
 * In-memory document model. Same content as the file, but entity collections are
 * keyed by id so commands can address entities directly (and Immer patches carry the
 * entity id in their path, which makes incremental index updates cheap).
 */
import type {
  Account,
  BalanceSnapshot,
  BudgetPeriod,
  Category,
  CustomBudget,
  FileMeta,
  FileSettings,
  Id,
  PlannerScenario,
  Statement,
  Tag,
  TemplateLine,
  Tombstone,
  Transaction,
  TransactFile,
} from './schema/types';
import { CURRENT_SCHEMA_VERSION, FILE_FORMAT } from './schema/version';

export type EntityMap<T> = Record<Id, T>;

/**
 * Transactions are the one collection that grows large (tens of thousands), so they are
 * split into buckets by the first character of their id's random part. Immer copies a
 * container when one of its entries changes; with buckets, an edit copies one bucket
 * (~1/62 of the transactions) instead of all of them. Always access transactions through
 * the helpers below.
 */
export type TransactionBuckets = Record<string, EntityMap<Transaction>>;

const BUCKET_CHAR = 4; // "txn_" prefix is 4 chars

export function transactionBucket(id: Id): string {
  return id.charAt(BUCKET_CHAR);
}

export function getTransaction(
  doc: Pick<DocModel, 'transactions'>,
  id: Id,
): Transaction | undefined {
  return doc.transactions[transactionBucket(id)]?.[id];
}

/** Inserts or replaces a transaction (works on Immer drafts). */
export function putTransaction(doc: Pick<DocModel, 'transactions'>, t: Transaction): void {
  const key = transactionBucket(t.id);
  (doc.transactions[key] ??= {})[t.id] = t;
}

/** Removes a transaction (works on Immer drafts). Returns whether it existed. */
export function removeTransaction(doc: Pick<DocModel, 'transactions'>, id: Id): boolean {
  const bucket = doc.transactions[transactionBucket(id)];
  if (!bucket || !(id in bucket)) return false;
  Reflect.deleteProperty(bucket, id);
  return true;
}

export function* iterateTransactions(doc: Pick<DocModel, 'transactions'>): Generator<Transaction> {
  for (const bucket of Object.values(doc.transactions)) yield* Object.values(bucket);
}

export function countTransactions(doc: Pick<DocModel, 'transactions'>): number {
  let n = 0;
  for (const bucket of Object.values(doc.transactions)) n += Object.keys(bucket).length;
  return n;
}

export interface DocModel {
  meta: FileMeta;
  settings: FileSettings;
  accounts: EntityMap<Account>;
  categories: EntityMap<Category>;
  tags: EntityMap<Tag>;
  transactions: TransactionBuckets;
  balanceSnapshots: EntityMap<BalanceSnapshot>;
  statements: EntityMap<Statement>;
  budgets: {
    template: { lines: EntityMap<TemplateLine>; updatedAt: string };
    periods: EntityMap<BudgetPeriod>;
    custom: EntityMap<CustomBudget>;
  };
  planner: { scenarios: EntityMap<PlannerScenario> };
  tombstones: Tombstone[];
}

function toMap<T extends { id: Id }>(items: readonly T[]): EntityMap<T> {
  const map: EntityMap<T> = {};
  for (const item of items) map[item.id] = item;
  return map;
}

function toBuckets(items: readonly Transaction[]): TransactionBuckets {
  const buckets: TransactionBuckets = {};
  for (const t of items) putTransaction({ transactions: buckets }, t);
  return buckets;
}

const byId = (a: { id: Id }, b: { id: Id }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byOrder = (a: { order: number; id: Id }, b: { order: number; id: Id }) =>
  a.order - b.order || byId(a, b);
const byDate = (a: { date: string; id: Id }, b: { date: string; id: Id }) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : byId(a, b);

export function fileToModel(file: TransactFile): DocModel {
  return {
    meta: file.meta,
    settings: file.settings,
    accounts: toMap(file.accounts),
    categories: toMap(file.categories),
    tags: toMap(file.tags),
    transactions: toBuckets(file.transactions),
    balanceSnapshots: toMap(file.balanceSnapshots),
    statements: toMap(file.statements),
    budgets: {
      template: {
        lines: toMap(file.budgets.template.lines),
        updatedAt: file.budgets.template.updatedAt,
      },
      periods: toMap(file.budgets.periods),
      custom: toMap(file.budgets.custom),
    },
    planner: { scenarios: toMap(file.planner.scenarios) },
    tombstones: file.tombstones,
  };
}

/** Converts back to the file shape with a deterministic order (stable, diff-friendly output). */
export function modelToFile(model: DocModel): TransactFile {
  const v = <T>(m: EntityMap<T>) => Object.values(m);
  return {
    format: FILE_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: model.meta,
    settings: model.settings,
    accounts: v(model.accounts).sort(byOrder),
    categories: v(model.categories).sort(byOrder),
    tags: v(model.tags).sort((a, b) => a.name.localeCompare(b.name) || byId(a, b)),
    transactions: [...iterateTransactions(model)].sort(byDate),
    balanceSnapshots: v(model.balanceSnapshots).sort(byDate),
    statements: v(model.statements).sort((a, b) =>
      a.endDate < b.endDate ? -1 : a.endDate > b.endDate ? 1 : byId(a, b),
    ),
    budgets: {
      template: {
        lines: v(model.budgets.template.lines).sort(byOrder),
        updatedAt: model.budgets.template.updatedAt,
      },
      periods: v(model.budgets.periods).sort((a, b) =>
        a.period < b.period ? -1 : a.period > b.period ? 1 : byId(a, b),
      ),
      custom: v(model.budgets.custom).sort((a, b) => a.priority - b.priority || byId(a, b)),
    },
    planner: { scenarios: v(model.planner.scenarios).sort(byId) },
    tombstones: [...model.tombstones].sort(byId),
  };
}

/**
 * Entity-level merge of two versions of a document that diverged (edited on two devices).
 *
 * With a common base (the version both started from), each record is compared on both
 * sides:
 *   - changed on one side only → that side's version (including deletions)
 *   - changed identically on both → either
 *   - changed differently on both → a conflict: the more recent edit (updatedAt) wins, an
 *     edit always beats a deletion (nothing is silently lost), and every conflict is
 *     reported so the user can review it.
 * Without a base (first sync between devices), records present on one side are kept,
 * unless the other side's tombstone shows a deletion newer than the record's last edit.
 */
import { iterateTransactions, putTransaction, type DocModel, type EntityMap } from '../model';
import type { Id, Transaction } from '../schema/types';

export interface MergeConflict {
  collection: string;
  id: Id;
  /** Human-readable description of the record (e.g. payee and date). */
  label: string;
  resolution: 'kept-local' | 'kept-remote' | 'kept-edit-over-delete';
}

export interface MergeResult {
  merged: DocModel;
  conflicts: MergeConflict[];
  /** Records taken from the other device's version. */
  fromRemote: number;
}

/** Structural equality ignoring key order (records are plain JSON). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

type Labeler<T> = (item: T) => string;
type Stamped = { id: Id; updatedAt?: string };

interface Context {
  conflicts: MergeConflict[];
  fromRemote: number;
  /** Deletion times from each side's tombstones (for base-less merges). */
  deletedLocal: Map<Id, string>;
  deletedRemote: Map<Id, string>;
  hasBase: boolean;
}

function mergeMap<T extends Stamped>(
  collection: string,
  base: EntityMap<T> | undefined,
  local: EntityMap<T>,
  remote: EntityMap<T>,
  label: Labeler<T>,
  ctx: Context,
): EntityMap<T> {
  const out: EntityMap<T> = {};
  const ids = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base ?? {})]);
  for (const id of ids) {
    const b = base?.[id];
    const l = local[id];
    const r = remote[id];
    let pick: T | undefined;
    if (!ctx.hasBase) {
      pick = l ?? r;
      if (l && r && !deepEqual(l, r)) {
        const remoteNewer = (r.updatedAt ?? '') > (l.updatedAt ?? '');
        pick = remoteNewer ? r : l;
        ctx.conflicts.push({
          collection,
          id,
          label: label(l),
          resolution: remoteNewer ? 'kept-remote' : 'kept-local',
        });
      }
      // Deleted on the other side after this side's last edit → deleted.
      const deleted = l ? ctx.deletedRemote.get(id) : ctx.deletedLocal.get(id);
      const present = l ?? r;
      if (present && !(l && r) && deleted && deleted > (present.updatedAt ?? '')) pick = undefined;
    } else {
      const localChanged = !deepEqual(b, l);
      const remoteChanged = !deepEqual(b, r);
      if (!localChanged) pick = r;
      else if (!remoteChanged || deepEqual(l, r)) pick = l;
      else if (!l || !r) {
        // Deleted on one side, edited on the other: keep the edit.
        pick = l ?? r;
        const kept = pick;
        if (kept)
          ctx.conflicts.push({
            collection,
            id,
            label: label(kept),
            resolution: 'kept-edit-over-delete',
          });
      } else {
        const remoteNewer = (r.updatedAt ?? '') > (l.updatedAt ?? '');
        pick = remoteNewer ? r : l;
        ctx.conflicts.push({
          collection,
          id,
          label: label(l),
          resolution: remoteNewer ? 'kept-remote' : 'kept-local',
        });
      }
    }
    if (pick) {
      out[id] = pick;
      if (pick !== l && !deepEqual(pick, l)) ctx.fromRemote++;
    } else if (l) {
      ctx.fromRemote++; // a remote deletion applied here
    }
  }
  return out;
}

function flattenTransactions(doc: Pick<DocModel, 'transactions'>): EntityMap<Transaction> {
  const map: EntityMap<Transaction> = {};
  for (const t of iterateTransactions(doc)) map[t.id] = t;
  return map;
}

/** Settings are merged per field (local wins when both changed differently). */
function mergeSettings(
  base: DocModel['settings'] | undefined,
  local: DocModel['settings'],
  remote: DocModel['settings'],
) {
  const out = { ...local } as Record<string, unknown>;
  for (const key of Object.keys(remote) as (keyof DocModel['settings'])[]) {
    const changedLocally = base ? !deepEqual(base[key], local[key]) : false;
    if (!changedLocally && base && !deepEqual(base[key], remote[key])) out[key] = remote[key];
  }
  return out as DocModel['settings'];
}

export function mergeDocuments(
  base: DocModel | null,
  local: DocModel,
  remote: DocModel,
): MergeResult {
  const tombstoneMap = (doc: DocModel) => new Map(doc.tombstones.map((t) => [t.id, t.deletedAt]));
  const ctx: Context = {
    conflicts: [],
    fromRemote: 0,
    deletedLocal: tombstoneMap(local),
    deletedRemote: tombstoneMap(remote),
    hasBase: base !== null,
  };
  const b = base ?? undefined;
  const named = (x: { name: string }) => x.name;

  const transactions = mergeMap(
    'transactions',
    b && flattenTransactions(b),
    flattenTransactions(local),
    flattenTransactions(remote),
    (t) => `${t.date} ${t.payee || 'transaction'}`,
    ctx,
  );
  const buckets: DocModel['transactions'] = {};
  for (const t of Object.values(transactions)) putTransaction({ transactions: buckets }, t);

  const merged: DocModel = {
    meta: { ...local.meta, revision: Math.max(local.meta.revision, remote.meta.revision) },
    settings: mergeSettings(b?.settings, local.settings, remote.settings),
    accounts: mergeMap('accounts', b?.accounts, local.accounts, remote.accounts, named, ctx),
    categories: mergeMap(
      'categories',
      b?.categories,
      local.categories,
      remote.categories,
      named,
      ctx,
    ),
    tags: mergeMap('tags', b?.tags, local.tags, remote.tags, named, ctx),
    transactions: buckets,
    balanceSnapshots: mergeMap(
      'balance updates',
      b?.balanceSnapshots,
      local.balanceSnapshots,
      remote.balanceSnapshots,
      (s) => `balance on ${s.date}`,
      ctx,
    ),
    statements: mergeMap(
      'statements',
      b?.statements,
      local.statements,
      remote.statements,
      (s) => `statement ending ${s.endDate}`,
      ctx,
    ),
    budgets: {
      template: {
        lines: mergeMap(
          'budget lines',
          b?.budgets.template.lines,
          local.budgets.template.lines,
          remote.budgets.template.lines,
          (l) => l.name ?? 'budget line',
          ctx,
        ),
        updatedAt:
          [local.budgets.template.updatedAt, remote.budgets.template.updatedAt].sort().at(-1) ??
          local.budgets.template.updatedAt,
      },
      periods: mergeMap(
        'budgets',
        b?.budgets.periods,
        local.budgets.periods,
        remote.budgets.periods,
        (p) => `${p.cadence} budget ${p.period}`,
        ctx,
      ),
      custom: mergeMap(
        'custom budgets',
        b?.budgets.custom,
        local.budgets.custom,
        remote.budgets.custom,
        named,
        ctx,
      ),
    },
    planner: {
      scenarios: mergeMap(
        'planner scenarios',
        b?.planner.scenarios,
        local.planner.scenarios,
        remote.planner.scenarios,
        named,
        ctx,
      ),
    },
    tombstones: [
      ...new Map([...remote.tombstones, ...local.tombstones].map((t) => [t.id, t])).values(),
    ],
  };
  repairReferences(merged);
  return { merged, conflicts: ctx.conflicts, fromRemote: ctx.fromRemote };
}

/**
 * Merging can leave links pointing at records the other device deleted (e.g. one side of a
 * transfer). Repairs the links that would otherwise make the file invalid or misleading.
 */
function repairReferences(doc: DocModel): void {
  const all = flattenTransactions(doc);
  for (const t of Object.values(all)) {
    const state: { changed: Transaction | null } = { changed: null };
    const edit = () => (state.changed ??= { ...t });
    if (t.transfer && all[t.transfer.peerId]?.transfer?.peerId !== t.id)
      Reflect.deleteProperty(edit(), 'transfer');
    if (t.statementId && !doc.statements[t.statementId])
      Reflect.deleteProperty(edit(), 'statementId');
    if (t.categoryId && !doc.categories[t.categoryId]) Reflect.deleteProperty(edit(), 'categoryId');
    if (t.tags?.some((id) => !doc.tags[id])) {
      const tags = t.tags.filter((id) => doc.tags[id]);
      if (tags.length) edit().tags = tags;
      else Reflect.deleteProperty(edit(), 'tags');
    }
    if (state.changed) putTransaction(doc, state.changed);
  }
}

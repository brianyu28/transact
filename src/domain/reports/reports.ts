/**
 * Report aggregations. All work in whole months and read the per-month category rollup
 * the index already maintains, so they cost O(months × categories), not O(transactions).
 *
 * Spending is the negative of net expense amounts (refunds reduce it); income is the net
 * of income-category amounts. Transfers and excluded splits are never counted.
 */
import { addDays, addMonthsToKey, type ISODate, type MonthKey } from '@/lib/date';
import { adjustmentsBetween, getLedger, netWorthSeries } from '../aggregates/balances';
import { UNCATEGORIZED, type DocIndex } from '../aggregates/docIndex';
import { categoryTree, type CategoryTree } from '../aggregates/lookups';
import { budgetView, lineLabel } from '../budgets/views';
import type { DocModel } from '../model';
import type { Cents, Id } from '../schema/types';

/** Inclusive list of months from `from` to `to`. */
export function monthsBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let m = from; m <= to && out.length < 1200; m = addMonthsToKey(m, 1)) out.push(m);
  return out;
}

export const OTHER = '__other';
export const GENERAL = '__general';

/** The bucket a category rolls up to when viewing the children of `parentId` (null = top level). */
function bucketFor(tree: CategoryTree, categoryId: Id, parentId: Id | null): Id | null {
  let node = tree.byId.get(categoryId);
  if (!node) return null;
  if (parentId === null) {
    while (node.category.parentId) {
      const parent = tree.byId.get(node.category.parentId);
      if (!parent) break;
      node = parent;
    }
    return node.category.id;
  }
  if (node.category.id === parentId) return GENERAL;
  // Walk up until the direct child of parentId.
  while (node.category.parentId && node.category.parentId !== parentId) {
    const parent = tree.byId.get(node.category.parentId);
    if (!parent) return null;
    node = parent;
  }
  return node.category.parentId === parentId ? node.category.id : null;
}

/** Spending per bucket per month (expense categories only; uncategorized at the top level). */
function spendingMatrix(
  doc: Pick<DocModel, 'categories'>,
  index: DocIndex,
  months: readonly MonthKey[],
  parentId: Id | null,
) {
  const tree = categoryTree(doc.categories);
  const matrix = new Map<Id, Cents[]>();
  months.forEach((month, i) => {
    for (const [categoryId, net] of index.categoryByMonth.get(month) ?? []) {
      let bucket: Id | null;
      if (categoryId === UNCATEGORIZED) {
        if (parentId !== null || net > 0) continue; // uncategorized inflows aren't spending
        bucket = UNCATEGORIZED;
      } else {
        if (tree.byId.get(categoryId)?.kind !== 'expense') continue;
        bucket = bucketFor(tree, categoryId, parentId);
      }
      if (bucket === null) continue;
      let row = matrix.get(bucket);
      if (!row) {
        row = new Array<Cents>(months.length).fill(0);
        matrix.set(bucket, row);
      }
      row[i] = (row[i] ?? 0) - net;
    }
  });
  return { tree, matrix };
}

function bucketLabel(tree: CategoryTree, bucket: Id, parentId: Id | null): string {
  if (bucket === UNCATEGORIZED) return 'Uncategorized';
  if (bucket === GENERAL)
    return `${parentId ? (tree.byId.get(parentId)?.category.name ?? '') : ''} (general)`;
  return tree.byId.get(bucket)?.category.name ?? 'Unknown';
}

export interface Series {
  key: Id;
  label: string;
  values: Cents[];
  total: Cents;
}

/**
 * Monthly spending by category: the largest `maxSeries` categories by total, with the
 * rest folded into "Other" (never more series than the palette can keep distinct).
 */
export function spendingByCategory(
  doc: Pick<DocModel, 'categories'>,
  index: DocIndex,
  months: readonly MonthKey[],
  parentId: Id | null = null,
  maxSeries = 7,
): { months: readonly MonthKey[]; series: Series[]; totals: Cents[] } {
  const { tree, matrix } = spendingMatrix(doc, index, months, parentId);
  const all: Series[] = [...matrix].map(([key, values]) => ({
    key,
    label: bucketLabel(tree, key, parentId),
    values,
    total: values.reduce((s, v) => s + v, 0),
  }));
  all.sort((a, b) => b.total - a.total);
  const fold = all.length > maxSeries + 1;
  const series = fold ? all.slice(0, maxSeries) : all;
  if (fold) {
    const rest = all.slice(maxSeries);
    const values = months.map((_, i) => rest.reduce((s, r) => s + (r.values[i] ?? 0), 0));
    series.push({
      key: OTHER,
      label: `Other (${rest.length})`,
      values,
      total: values.reduce((s, v) => s + v, 0),
    });
  }
  const totals = months.map((_, i) => all.reduce((s, r) => s + (r.values[i] ?? 0), 0));
  return {
    months,
    series: series.filter((s) => s.total !== 0 || s.values.some((v) => v !== 0)),
    totals,
  };
}

export interface BreakdownRow {
  key: Id;
  label: string;
  total: Cents;
  share: number;
  previous: Cents;
  hasChildren: boolean;
}

/** Spending by category over the months, compared with the same number of months before. */
export function categoryBreakdown(
  doc: Pick<DocModel, 'categories'>,
  index: DocIndex,
  months: readonly MonthKey[],
  parentId: Id | null = null,
): { rows: BreakdownRow[]; total: Cents; previousTotal: Cents } {
  const first = months[0];
  if (!first) return { rows: [], total: 0, previousTotal: 0 };
  const previousMonths = monthsBetween(
    addMonthsToKey(first, -months.length),
    addMonthsToKey(first, -1),
  );
  const current = spendingMatrix(doc, index, months, parentId);
  const previous = spendingMatrix(doc, index, previousMonths, parentId).matrix;
  const sum = (v: readonly Cents[] | undefined) => (v ?? []).reduce((s, x) => s + x, 0);
  const total = [...current.matrix.values()].reduce((s, v) => s + sum(v), 0);
  const keys = new Set([...current.matrix.keys(), ...previous.keys()]);
  const rows = [...keys]
    .map((key) => {
      const node = current.tree.byId.get(key);
      const t = sum(current.matrix.get(key));
      return {
        key,
        label: bucketLabel(current.tree, key, parentId),
        total: t,
        share: total > 0 ? t / total : 0,
        previous: sum(previous.get(key)),
        hasChildren: node ? node.subtree.length > 1 : false,
      };
    })
    .filter((r) => r.total !== 0 || r.previous !== 0)
    .sort((a, b) => b.total - a.total || b.previous - a.previous);
  return { rows, total, previousTotal: [...previous.values()].reduce((s, v) => s + sum(v), 0) };
}

export interface IncomeSpendingMonth {
  month: MonthKey;
  income: Cents;
  spending: Cents;
  net: Cents;
}

export function incomeVsSpending(
  doc: Pick<DocModel, 'categories'>,
  index: DocIndex,
  months: readonly MonthKey[],
): IncomeSpendingMonth[] {
  const tree = categoryTree(doc.categories);
  return months.map((month) => {
    let income = 0;
    let spending = 0;
    for (const [categoryId, net] of index.categoryByMonth.get(month) ?? []) {
      const kind =
        categoryId === UNCATEGORIZED
          ? net > 0
            ? 'income'
            : 'expense'
          : tree.byId.get(categoryId)?.kind;
      if (kind === 'income') income += net;
      else if (kind === 'expense') spending -= net;
    }
    return { month, income, spending, net: income - spending };
  });
}

export interface BudgetHistory {
  months: readonly MonthKey[];
  lines: {
    lineId: Id;
    label: string;
    cells: ({ budgeted: Cents; spent: Cents; created: boolean } | null)[];
  }[];
  totals: { budgeted: Cents; spent: Cents }[];
}

/** Monthly budget lines × months: what was budgeted and spent each month. */
export function budgetHistory(
  doc: Pick<DocModel, 'budgets' | 'categories' | 'settings' | 'transactions'>,
  index: DocIndex,
  months: readonly MonthKey[],
  today: ISODate,
): BudgetHistory {
  const views = months.map((m) => budgetView(doc, index, 'monthly', m, today));
  const order = Object.values(doc.budgets.template.lines)
    .filter((l) => l.cadence === 'monthly')
    .sort((a, b) => a.order - b.order)
    .map((l) => l.id);
  const ids = new Set(order);
  for (const v of views) for (const l of v.lines) ids.add(l.lineId);
  const lines = [...ids].map((lineId) => {
    const latest = [...views]
      .reverse()
      .find((v) => v.lines.some((l) => l.lineId === lineId))
      ?.lines.find((l) => l.lineId === lineId);
    return {
      lineId,
      label: latest?.label ?? lineLabel(doc, { target: { kind: 'everythingElse' } }),
      cells: views.map((v) => {
        const line = v.lines.find((l) => l.lineId === lineId);
        return line
          ? { budgeted: line.budgeted, spent: line.spent, created: v.period !== undefined }
          : null;
      }),
    };
  });
  return {
    months,
    lines,
    totals: views.map((v) => ({ budgeted: v.totals.budgeted, spent: v.totals.spent })),
  };
}

export interface NetWorthChange {
  month: MonthKey;
  start: Cents;
  end: Cents;
  change: Cents;
  /** Recorded by balance updates (market moves, corrections). */
  market: Cents;
  /** Everything else: what transactions added or removed (income − spending, interest…). */
  saved: Cents;
}

/** How net worth changed each month, split into transactions vs. balance updates. */
export function netWorthChanges(
  doc: Pick<DocModel, 'accounts' | 'balanceSnapshots'>,
  index: DocIndex,
  months: readonly MonthKey[],
  today: ISODate,
): NetWorthChange[] {
  const ends = months.map((m) => {
    const end = `${addMonthsToKey(m, 1)}-01`;
    return end > today ? today : dayBefore(end);
  });
  const first = months[0];
  if (!first) return [];
  const points = netWorthSeries(doc, index, [dayBefore(`${first}-01`), ...ends]);
  const ledgers = Object.values(doc.accounts).map((a) => getLedger(doc, index, a.id));
  return months.map((month, i) => {
    const start = points[i]?.net ?? 0;
    const end = points[i + 1]?.net ?? 0;
    const from = `${month}-01`;
    const to = `${addMonthsToKey(month, 1)}-01`;
    const market = ledgers.reduce((s, l) => s + adjustmentsBetween(l, from, to), 0);
    return { month, start, end, change: end - start, market, saved: end - start - market };
  });
}

const dayBefore = (date: ISODate): ISODate => addDays(date, -1);

/**
 * Report aggregations over date spans. Whole months read the per-month category rollup the
 * index already maintains; only the days of partially covered months are scanned, so a report
 * costs O(columns × categories) plus the transactions in its partial months.
 *
 * Spending is the negative of net expense amounts (refunds reduce it); income is the net
 * of income-category amounts. Transfers and excluded splits are never counted.
 */
import {
  addDays,
  addMonthsToKey,
  diffDays,
  endOfMonth,
  maxDate,
  monthKey,
  startOfMonth,
  type ISODate,
  type MonthKey,
} from '@/lib/date';
import { adjustmentsBetween, getLedger, netWorthSeries } from '../aggregates/balances';
import { UNCATEGORIZED, type DocIndex } from '../aggregates/docIndex';
import { categoryTree, type CategoryTree } from '../aggregates/lookups';
import { budgetView, lineLabel } from '../budgets/views';
import { getTransaction, type DocModel } from '../model';
import type { Cents, Id } from '../schema/types';
import { effectiveSplits } from '../transactions/splits';

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

/** Inclusive date span. */
export interface Span {
  from: ISODate;
  to: ISODate;
}

/** One chart column / table row of a report: a day or (part of) a month. */
export interface ReportColumn extends Span {
  /** The day (ISODate) or month (MonthKey). */
  key: string;
}

export interface ReportPeriod extends Span {
  unit: 'day' | 'month';
  columns: ReportColumn[];
  /** Calendar months the period touches. */
  months: MonthKey[];
}

/** Spans of up to this many days are shown day by day; longer ones month by month. */
export const DAILY_MAX_DAYS = 31;

/** Columns for [from, to]: days for short spans, otherwise months clipped to the span. */
export function reportPeriod(from: ISODate, to: ISODate): ReportPeriod {
  if (to < from) to = from;
  const months = monthsBetween(monthKey(from), monthKey(to));
  if (diffDays(from, to) + 1 <= DAILY_MAX_DAYS) {
    const columns: ReportColumn[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) columns.push({ key: d, from: d, to: d });
    return { from, to, unit: 'day', columns, months };
  }
  const columns = months.map((m) => ({
    key: m,
    from: maxDate(`${m}-01`, from),
    to: minDate(endOfMonth(`${m}-01`), to),
  }));
  return { from, to, unit: 'month', columns, months };
}

/** Whether the span is made of whole calendar months. */
export const isWholeMonths = (span: Span): boolean =>
  span.from === startOfMonth(span.from) && span.to === endOfMonth(span.to);

/**
 * The span of the same length just before: as many whole months for a span of whole
 * months, otherwise as many days.
 */
export function previousSpan(span: Span): Span {
  const to = addDays(span.from, -1);
  if (isWholeMonths(span)) {
    const count = monthsBetween(monthKey(span.from), monthKey(span.to)).length;
    return { from: `${addMonthsToKey(monthKey(span.from), -count)}-01`, to };
  }
  return { from: addDays(span.from, -(diffDays(span.from, span.to) + 1)), to };
}

const minDate = (a: ISODate, b: ISODate): ISODate => (a < b ? a : b);

/**
 * Calls `fn` with each category's net amount over the span (several times per category
 * when the span covers more than one month). `excluded` selects excluded splits instead.
 */
export function forEachCategoryNet(
  doc: Pick<DocModel, 'transactions'>,
  index: DocIndex,
  span: Span,
  excluded: boolean,
  fn: (categoryId: Id, net: Cents) => void,
): void {
  const rollup = excluded ? index.excludedByMonth : index.categoryByMonth;
  for (const month of monthsBetween(monthKey(span.from), monthKey(span.to))) {
    const first = `${month}-01`;
    const last = endOfMonth(first);
    if (span.from <= first && span.to >= last) {
      for (const [categoryId, net] of rollup.get(month) ?? []) fn(categoryId, net);
      continue;
    }
    if (!rollup.has(month)) continue; // nothing that month
    for (const id of index.idsInRange(maxDate(first, span.from), minDate(last, span.to))) {
      const t = getTransaction(doc, id);
      if (!t || t.transfer) continue;
      for (const split of effectiveSplits(t)) {
        if (split.excluded === excluded) fn(split.categoryId ?? UNCATEGORIZED, split.amount);
      }
    }
  }
}

/** Spending per bucket per column (expense categories only; uncategorized at the top level). */
function spendingMatrix(
  doc: Pick<DocModel, 'categories' | 'transactions'>,
  index: DocIndex,
  columns: readonly Span[],
  parentId: Id | null,
) {
  const tree = categoryTree(doc.categories);
  const matrix = new Map<Id, Cents[]>();
  columns.forEach((column, i) => {
    // Net per category over the column first: uncategorized inflows only drop out on balance.
    const nets = new Map<Id, Cents>();
    forEachCategoryNet(doc, index, column, false, (categoryId, net) => {
      nets.set(categoryId, (nets.get(categoryId) ?? 0) + net);
    });
    for (const [categoryId, net] of nets) {
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
        row = new Array<Cents>(columns.length).fill(0);
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
 * Spending by category per column: the largest `maxSeries` categories by total, with the
 * rest folded into "Other" (never more series than the palette can keep distinct).
 */
export function spendingByCategory(
  doc: Pick<DocModel, 'categories' | 'transactions'>,
  index: DocIndex,
  columns: readonly Span[],
  parentId: Id | null = null,
  maxSeries = 7,
): { series: Series[]; totals: Cents[] } {
  const { tree, matrix } = spendingMatrix(doc, index, columns, parentId);
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
    const values = columns.map((_, i) => rest.reduce((s, r) => s + (r.values[i] ?? 0), 0));
    series.push({
      key: OTHER,
      label: `Other (${String(rest.length)})`,
      values,
      total: values.reduce((s, v) => s + v, 0),
    });
  }
  const totals = columns.map((_, i) => all.reduce((s, r) => s + (r.values[i] ?? 0), 0));
  return {
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

/** Spending by category over the span, compared with the span just before (`previousSpan`). */
export function categoryBreakdown(
  doc: Pick<DocModel, 'categories' | 'transactions'>,
  index: DocIndex,
  span: Span,
  parentId: Id | null = null,
): { rows: BreakdownRow[]; total: Cents; previousTotal: Cents } {
  const current = spendingMatrix(doc, index, [span], parentId);
  const previous = spendingMatrix(doc, index, [previousSpan(span)], parentId).matrix;
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

export interface IncomeSpending {
  income: Cents;
  spending: Cents;
  net: Cents;
}

/** Income and spending per column. */
export function incomeVsSpending(
  doc: Pick<DocModel, 'categories' | 'transactions'>,
  index: DocIndex,
  columns: readonly Span[],
  options: { includeExcluded?: boolean } = {},
): IncomeSpending[] {
  const tree = categoryTree(doc.categories);
  return columns.map((column) => {
    const nets = new Map<Id, Cents>();
    const add = (categoryId: Id, net: Cents) => {
      nets.set(categoryId, (nets.get(categoryId) ?? 0) + net);
    };
    let income = 0;
    let spending = 0;
    const tally = () => {
      for (const [categoryId, net] of nets) {
        const kind =
          categoryId === UNCATEGORIZED
            ? net > 0
              ? 'income'
              : 'expense'
            : tree.byId.get(categoryId)?.kind;
        if (kind === 'income') income += net;
        else if (kind === 'expense') spending -= net;
      }
      nets.clear();
    };
    forEachCategoryNet(doc, index, column, false, add);
    tally();
    if (options.includeExcluded) {
      forEachCategoryNet(doc, index, column, true, add);
      tally();
    }
    return { income, spending, net: income - spending };
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
  start: Cents;
  end: Cents;
  change: Cents;
  /** Recorded by balance updates (market moves, corrections). */
  market: Cents;
  /** Everything else: what transactions added or removed (income − spending, interest…). */
  saved: Cents;
}

/** How net worth changed in each column, split into transactions vs. balance updates. */
export function netWorthChanges(
  doc: Pick<DocModel, 'accounts' | 'balanceSnapshots'>,
  index: DocIndex,
  columns: readonly Span[],
  today: ISODate,
): NetWorthChange[] {
  const first = columns[0];
  if (!first) return [];
  // Columns after today show no change.
  const ends = columns.map((c) => minDate(c.to, today));
  const startDate = minDate(addDays(first.from, -1), today);
  const points = netWorthSeries(doc, index, [startDate, ...ends]);
  const ledgers = Object.values(doc.accounts).map((a) => getLedger(doc, index, a.id));
  return columns.map((_, i) => {
    const start = points[i]?.net ?? 0;
    const end = points[i + 1]?.net ?? 0;
    const from = i === 0 ? startDate : (ends[i - 1] as ISODate);
    const to = ends[i] as ISODate;
    const market = ledgers.reduce((s, l) => s + adjustmentsBetween(l, from, to), 0);
    return { start, end, change: end - start, market, saved: end - start - market };
  });
}

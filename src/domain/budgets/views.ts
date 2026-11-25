/**
 * Budget views: budgeted vs. spent for a monthly or annual period, custom budget totals,
 * and rollover suggestions for creating the next period. Spending is the negative of the
 * summed split amounts, so refunds reduce it.
 */
import { addDays, monthKey as toMonthKey, type ISODate } from '@/lib/date';
import { idFromKey, type DocIndex } from '../aggregates/docIndex';
import { categoryTree } from '../aggregates/lookups';
import { getTransaction, type DocModel } from '../model';
import type {
  BudgetPeriod,
  BudgetTarget,
  BudgetTier,
  Cents,
  CustomBudget,
  Id,
  PlanItem,
  RolloverPolicy,
  Transaction,
} from '../schema/types';
import { effectiveSplits } from '../transactions/splits';
import { createAssigner, type Assigner, type BudgetRef, type LineSpec } from './assign';
import {
  annualKey,
  periodBounds,
  periodElapsed,
  periodLabel,
  shiftPeriod,
  type PeriodBounds,
  type PeriodKey,
} from './periods';

type Doc = Pick<DocModel, 'budgets' | 'categories' | 'settings' | 'transactions'>;

export interface EffectiveLine extends LineSpec {
  name: string | undefined;
  /** The created period's note for this line (default-line notes stay with the defaults). */
  note: string | undefined;
  /** The created period's plan items for this line (default-line plans stay too). */
  plan: readonly PlanItem[] | undefined;
  base: Cents;
  rollover: Cents;
}

/** Lines in effect for a period: the created period's, else the defaults (provisional). */
export function linesFor(
  doc: Doc,
  cadence: BudgetTier,
  key: PeriodKey,
): { period: BudgetPeriod | undefined; lines: EffectiveLine[] } {
  const period = findPeriod(doc, cadence, key);
  if (period) {
    return {
      period,
      lines: period.lines.map((l) => ({
        lineId: l.templateLineId,
        target: l.target,
        name: l.name,
        note: l.note,
        plan: l.plan,
        base: l.base,
        rollover: l.rollover,
      })),
    };
  }
  const lines = Object.values(doc.budgets.template.lines)
    .filter((l) => l.cadence === cadence)
    .sort((a, b) => a.order - b.order)
    .map((l) => ({
      lineId: l.id,
      target: l.target,
      name: l.name,
      note: undefined,
      plan: undefined,
      base: l.defaultAmount,
      rollover: 0,
    }));
  return { period: undefined, lines };
}

export function findPeriod(
  doc: Pick<DocModel, 'budgets'>,
  cadence: BudgetTier,
  key: PeriodKey,
): BudgetPeriod | undefined {
  return Object.values(doc.budgets.periods).find((p) => p.cadence === cadence && p.period === key);
}

export function lineLabel(
  doc: Pick<DocModel, 'categories'>,
  line: { name?: string | undefined; target: BudgetTarget },
): string {
  if (line.name) return line.name;
  if (line.target.kind === 'everythingElse') return 'Everything Else';
  const tree = categoryTree(doc.categories);
  return line.target.categoryIds.map((id) => tree.byId.get(id)?.path ?? 'Unknown').join(', ');
}

/** Builds (and caches per month) the assigner for transactions dated in that month. */
function assignerCache(doc: Doc) {
  const tree = categoryTree(doc.categories);
  const custom = Object.values(doc.budgets.custom);
  const cache = new Map<string, Assigner>();
  return (date: ISODate): Assigner => {
    const month = toMonthKey(date);
    let assigner = cache.get(month);
    if (!assigner) {
      assigner = createAssigner({
        tree,
        settings: doc.settings.budget,
        custom,
        lines: {
          monthly: linesFor(doc, 'monthly', month).lines,
          annual: linesFor(doc, 'annual', annualKey(date, doc.settings.budgetYearStartMonth)).lines,
        },
      });
      cache.set(month, assigner);
    }
    return assigner;
  };
}

/**
 * Which budgets a transaction counts toward (one ref per split that counts), using the
 * same rules as the budget views. Assigners are cached per month.
 */
export function createBudgetResolver(doc: Doc): (t: Transaction) => BudgetRef[] {
  const assignerFor = assignerCache(doc);
  return (t) => {
    if (t.transfer) return [];
    const assigner = assignerFor(t.date);
    const refs: BudgetRef[] = [];
    for (const split of effectiveSplits(t)) {
      const ref = assigner.assign(split, t.date);
      if (ref) refs.push(ref);
    }
    return refs;
  };
}

export interface Spending {
  /** lineId → spent, for lines of the requested cadence. */
  byLine: Map<Id, Cents>;
  /** Spending not covered by any budget. */
  unbudgeted: Cents;
  /** Spending that went to custom budgets instead (budgetId → spent). */
  custom: Map<Id, Cents>;
  /** Income received (income categories). */
  income: Cents;
  /** Transactions with uncategorized, non-excluded splits. */
  uncategorizedCount: number;
}

/** Spending in [from, to] by budget line of the given cadence. */
export function spendingBetween(
  doc: Doc,
  index: DocIndex,
  cadence: BudgetTier,
  bounds: PeriodBounds,
): Spending {
  const assignerFor = assignerCache(doc);
  const tree = categoryTree(doc.categories);
  const out: Spending = {
    byLine: new Map(),
    unbudgeted: 0,
    custom: new Map(),
    income: 0,
    uncategorizedCount: 0,
  };
  for (const key of keysInRange(index, bounds)) {
    const t = getTransaction(doc, idFromKey(key));
    if (!t || t.transfer) continue;
    const assigner = assignerFor(t.date);
    let uncategorized = false;
    for (const split of effectiveSplits(t)) {
      if (split.excluded) continue;
      if (!split.categoryId) uncategorized = true;
      if (split.categoryId && tree.byId.get(split.categoryId)?.kind === 'income') {
        out.income += split.amount;
        continue;
      }
      const ref = assigner.assign(split, t.date);
      const spent = -split.amount;
      if (!ref) continue;
      if (ref.kind === 'line' && ref.cadence === cadence)
        out.byLine.set(ref.lineId, (out.byLine.get(ref.lineId) ?? 0) + spent);
      else if (ref.kind === 'unbudgeted') out.unbudgeted += spent;
      else if (ref.kind === 'custom')
        out.custom.set(ref.budgetId, (out.custom.get(ref.budgetId) ?? 0) + spent);
    }
    if (uncategorized) out.uncategorizedCount++;
  }
  return out;
}

function* keysInRange(index: DocIndex, bounds: PeriodBounds): Generator<string> {
  const keys = index.byDate;
  let lo = 0;
  let hi = keys.length;
  const from = `${bounds.start}|`;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((keys[mid] as string) < from) lo = mid + 1;
    else hi = mid;
  }
  const to = `${bounds.end}|￿`;
  for (let i = lo; i < keys.length && (keys[i] as string) < to; i++) yield keys[i] as string;
}

export interface LineView extends EffectiveLine {
  label: string;
  budgeted: Cents;
  spent: Cents;
  remaining: Cents;
}

export interface BudgetView {
  cadence: BudgetTier;
  key: PeriodKey;
  label: string;
  bounds: PeriodBounds;
  /** Fraction of the period elapsed (for pace markers). */
  elapsed: number;
  /** The created period, or undefined when showing the defaults. */
  period: BudgetPeriod | undefined;
  lines: LineView[];
  totals: { budgeted: Cents; spent: Cents; remaining: Cents };
  unbudgeted: Cents;
  income: Cents;
  uncategorizedCount: number;
}

export function budgetView(
  doc: Doc,
  index: DocIndex,
  cadence: BudgetTier,
  key: PeriodKey,
  today: ISODate,
): BudgetView {
  const startMonth = doc.settings.budgetYearStartMonth;
  const bounds = periodBounds(cadence, key, startMonth);
  const { period, lines } = linesFor(doc, cadence, key);
  const spending = spendingBetween(doc, index, cadence, bounds);
  const views = lines.map((l): LineView => {
    const budgeted = l.base + l.rollover;
    const spent = spending.byLine.get(l.lineId) ?? 0;
    return { ...l, label: lineLabel(doc, l), budgeted, spent, remaining: budgeted - spent };
  });
  const budgeted = views.reduce((s, l) => s + l.budgeted, 0);
  const spent = views.reduce((s, l) => s + l.spent, 0);
  return {
    cadence,
    key,
    label: periodLabel(cadence, key, startMonth),
    bounds,
    elapsed: periodElapsed(bounds, today),
    period,
    lines: views,
    totals: { budgeted, spent, remaining: budgeted - spent },
    unbudgeted: spending.unbudgeted,
    income: spending.income,
    uncategorizedCount: spending.uncategorizedCount,
  };
}

// ── Custom budgets ───────────────────────────────────────────────────────────

export interface CustomBudgetView {
  budget: CustomBudget;
  bounds: PeriodBounds;
  lines: { lineId: Id | null; label: string; amount: Cents | null; spent: Cents }[];
  total: Cents;
  spent: Cents;
}

/** Spending in each custom budget over its own date range (or all time). */
export function customBudgetViews(
  doc: Doc & Pick<DocModel, 'tags'>,
  index: DocIndex,
  today: ISODate,
): CustomBudgetView[] {
  const budgets = Object.values(doc.budgets.custom).sort((a, b) => a.priority - b.priority);
  if (budgets.length === 0) return [];
  const tree = categoryTree(doc.categories);
  const assigner = createAssigner({
    tree,
    settings: doc.settings.budget,
    custom: budgets,
    lines: { monthly: [], annual: [] },
  });
  const first = index.byDate[0]?.slice(0, 10) ?? today;
  const last = index.byDate.at(-1)?.slice(0, 10) ?? today;
  const spent = new Map<Id, Map<Id | null, Cents>>();
  for (const key of keysInRange(index, { start: first, end: last })) {
    const t = getTransaction(doc, idFromKey(key));
    if (!t || t.transfer) continue;
    for (const split of effectiveSplits(t)) {
      const ref = assigner.assign(split, t.date);
      if (ref?.kind !== 'custom') continue;
      const lines = spent.get(ref.budgetId) ?? new Map<Id | null, Cents>();
      lines.set(ref.lineId, (lines.get(ref.lineId) ?? 0) - split.amount);
      spent.set(ref.budgetId, lines);
    }
  }
  return budgets.map((budget) => {
    const byLine = spent.get(budget.id) ?? new Map<Id | null, Cents>();
    const lines: CustomBudgetView['lines'] = budget.lines.map((l) => ({
      lineId: l.id,
      label: l.name || lineLabel(doc, l),
      amount: l.amount,
      spent: byLine.get(l.id) ?? 0,
    }));
    const unallocated = byLine.get(null) ?? 0;
    if (unallocated !== 0)
      lines.push({ lineId: null, label: 'Other', amount: null, spent: unallocated });
    const total = budget.lines.reduce((s, l) => s + l.amount, 0);
    return {
      budget,
      bounds: {
        start: budget.dateRange?.start ?? first,
        end: budget.dateRange?.end ?? addDays(today, 0),
      },
      lines,
      total,
      spent: lines.reduce((s, l) => s + l.spent, 0),
    };
  });
}

// ── Rollover ─────────────────────────────────────────────────────────────────

export interface RolloverRow {
  templateLineId: Id;
  label: string;
  target: BudgetTarget;
  name: string | undefined;
  defaultAmount: Cents;
  policy: RolloverPolicy;
  /** Remaining in the previous period (budgeted − spent), or null if it wasn't created. */
  previousRemaining: Cents | null;
  /** Suggested rollover per the line's policy. */
  suggested: Cents;
}

/** Rows for the "create period" wizard: defaults plus rollover from the previous period. */
export function rolloverSuggestions(
  doc: Doc,
  index: DocIndex,
  cadence: BudgetTier,
  key: PeriodKey,
  today: ISODate,
): RolloverRow[] {
  const prevKey = shiftPeriod(cadence, key, -1);
  const prev = findPeriod(doc, cadence, prevKey)
    ? budgetView(doc, index, cadence, prevKey, today)
    : undefined;
  return Object.values(doc.budgets.template.lines)
    .filter((l) => l.cadence === cadence)
    .sort((a, b) => a.order - b.order)
    .map((l) => {
      const prevLine = prev?.lines.find((p) => p.lineId === l.id);
      const previousRemaining = prevLine ? prevLine.remaining : null;
      const suggested =
        l.rolloverPolicy === 'none' || previousRemaining === null ? 0 : previousRemaining;
      return {
        templateLineId: l.id,
        label: lineLabel(doc, l),
        target: l.target,
        name: l.name,
        defaultAmount: l.defaultAmount,
        policy: l.rolloverPolicy,
        previousRemaining,
        suggested,
      };
    });
}

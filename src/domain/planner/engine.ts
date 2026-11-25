/**
 * Income → taxes → deductions → take-home, from user-editable rules. Nothing about any
 * country's tax law is hard-coded here: templates (templates.ts) supply starting rules.
 *
 * Bases:
 *   gross          all income
 *   wages          W-2 income (payroll taxes)
 *   seEarnings     1099 / self-employment income
 *   taxableIncome  all income (for income taxes)
 * Pre-tax deductions reduce the bases they list (e.g. a 401(k) reduces taxableIncome but
 * not wages; health premiums usually reduce both).
 *
 * Each tax rule: base × factor − Σ(fraction × other taxes) − deduction, floored at 0,
 * capped (cap − capReducedBy base), minus threshold, then a flat rate or brackets.
 *
 * Households: incomes and deductions can belong to a person. "Per person" rules (Social
 * Security, Medicare, self-employment tax) run on each person's own bases, with the cap
 * and threshold applied per person, and are summed. Other rules (income tax, Additional
 * Medicare for joint filers) run on the household's combined bases.
 */
import type { Cents, Id, PlannerScenario, TaxRule } from '../schema/types';

export type TaxBase = TaxRule['base'];

export const TAX_BASE_LABELS: Record<TaxBase, string> = {
  gross: 'All income',
  wages: 'W-2 wages',
  seEarnings: 'Self-employment income',
  taxableIncome: 'Taxable income',
};

export interface TaxLine {
  rule: TaxRule;
  /** The amount the rate was applied to (summed across people for per-person rules). */
  taxable: Cents;
  amount: Cents;
  /** Per-person rules: each person's share ('' = items not assigned to anyone). */
  byPerson?: { person: Id; taxable: Cents; amount: Cents }[];
}

export interface PlannerResult {
  gross: Cents;
  byKind: Record<'w2' | '1099' | 'other', Cents>;
  bases: Record<TaxBase, Cents>;
  taxes: TaxLine[];
  totalTax: Cents;
  pretaxDeductions: Cents;
  posttaxDeductions: Cents;
  /** Annual take-home pay: gross − taxes − all deductions. */
  takeHome: Cents;
  monthlyTakeHome: Cents;
  effectiveRate: number;
  /** Tax on the next dollar of the largest income source. */
  marginalRate: number;
  /** Set when the rules can't be evaluated (e.g. two taxes reduce each other). */
  error: string | null;
}

export function applySchedule(schedule: TaxRule['schedule'], amount: number): number {
  if (amount <= 0) return 0;
  if (schedule.kind === 'flat') return amount * schedule.rate;
  let tax = 0;
  let lower = 0;
  for (const bracket of schedule.brackets) {
    const upper = bracket.upTo ?? Infinity;
    if (amount > lower) tax += (Math.min(amount, upper) - lower) * bracket.rate;
    if (amount <= upper) break;
    lower = upper;
  }
  return tax;
}

/** Rules ordered so every rule comes after the taxes it subtracts; null on a cycle. */
function evaluationOrder(rules: readonly TaxRule[]): TaxRule[] | null {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const out: TaxRule[] = [];
  const state = new Map<Id, 'visiting' | 'done'>();
  const visit = (rule: TaxRule): boolean => {
    const s = state.get(rule.id);
    if (s === 'done') return true;
    if (s === 'visiting') return false;
    state.set(rule.id, 'visiting');
    for (const dep of rule.lessTaxes ?? []) {
      const r = byId.get(dep.taxId);
      if (r && !visit(r)) return false;
    }
    state.set(rule.id, 'done');
    out.push(rule);
    return true;
  };
  for (const r of rules) if (!visit(r)) return null;
  return out;
}

type Bases = Record<TaxBase, number>;

/** Applies one rule to a set of bases; `taxAmount` gives the (same-scope) amount of another tax. */
function evaluateRule(
  rule: TaxRule,
  bases: Bases,
  taxAmount: (id: Id) => number,
): { taxable: number; amount: number } {
  let base = bases[rule.base] * (rule.baseFactor ?? 1);
  for (const dep of rule.lessTaxes ?? []) base -= dep.fraction * taxAmount(dep.taxId);
  base = Math.max(0, base - (rule.deduction ?? 0));
  if (rule.cap !== undefined) {
    const cap = Math.max(0, rule.cap - (rule.capReducedBy ? bases[rule.capReducedBy] : 0));
    base = Math.min(base, cap);
  }
  if (rule.threshold !== undefined) base = Math.max(0, base - rule.threshold);
  return { taxable: base, amount: applySchedule(rule.schedule, base) };
}

const UNASSIGNED = '';

function compute(
  scenario: Pick<PlannerScenario, 'incomes' | 'deductions' | 'taxes'> &
    Partial<Pick<PlannerScenario, 'people'>>,
): Omit<PlannerResult, 'marginalRate'> {
  const known = new Set((scenario.people ?? []).map((p) => p.id));
  const groupOf = (person: Id | undefined) => (person && known.has(person) ? person : UNASSIGNED);
  const groups = new Map<Id, Bases>();
  const groupBases = (g: Id) => {
    let b = groups.get(g);
    if (!b) {
      b = { gross: 0, wages: 0, seEarnings: 0, taxableIncome: 0 };
      groups.set(g, b);
    }
    return b;
  };
  for (const p of scenario.people ?? []) groupBases(p.id);

  const byKind = { w2: 0, '1099': 0, other: 0 };
  for (const i of scenario.incomes) {
    byKind[i.kind] += i.annual;
    const b = groupBases(groupOf(i.person));
    b.gross += i.annual;
    b.taxableIncome += i.annual;
    if (i.kind === 'w2') b.wages += i.annual;
    if (i.kind === '1099') b.seEarnings += i.annual;
  }
  const gross = byKind.w2 + byKind['1099'] + byKind.other;
  let pretax = 0;
  let posttax = 0;
  for (const d of scenario.deductions) {
    if (!d.pretax) {
      posttax += d.annual;
      continue;
    }
    pretax += d.annual;
    const b = groupBases(groupOf(d.person));
    for (const base of d.reduces) b[base] = Math.max(0, b[base] - d.annual);
  }
  const household: Bases = { gross: 0, wages: 0, seEarnings: 0, taxableIncome: 0 };
  for (const b of groups.values())
    for (const k of Object.keys(household) as TaxBase[]) household[k] += b[k];
  // A per-person rule with nobody to apply to still runs once (on the household).
  if (groups.size === 0) groups.set(UNASSIGNED, { ...household });

  const order = evaluationOrder(scenario.taxes);
  const totals = new Map<Id, number>();
  const perGroup = new Map<Id, Map<Id, number>>(); // ruleId → group → amount
  const lines: TaxLine[] = [];
  if (order) {
    for (const rule of order) {
      if (rule.perPerson) {
        const amounts = new Map<Id, number>();
        const byPerson: NonNullable<TaxLine['byPerson']> = [];
        let taxable = 0;
        let amount = 0;
        for (const [g, bases] of groups) {
          // Within a person, other per-person taxes are that person's; household taxes are whole.
          const r = evaluateRule(
            rule,
            bases,
            (id) => perGroup.get(id)?.get(g) ?? totals.get(id) ?? 0,
          );
          amounts.set(g, r.amount);
          taxable += r.taxable;
          amount += r.amount;
          if (bases.gross > 0 || r.amount > 0)
            byPerson.push({
              person: g,
              taxable: Math.round(r.taxable),
              amount: Math.round(r.amount),
            });
        }
        perGroup.set(rule.id, amounts);
        totals.set(rule.id, amount);
        lines.push({ rule, taxable: Math.round(taxable), amount: Math.round(amount), byPerson });
      } else {
        const r = evaluateRule(rule, household, (id) => totals.get(id) ?? 0);
        totals.set(rule.id, r.amount);
        lines.push({ rule, taxable: Math.round(r.taxable), amount: Math.round(r.amount) });
      }
    }
  }
  // Present taxes in the user's order, not evaluation order.
  const position = new Map(scenario.taxes.map((r, i) => [r.id, i]));
  lines.sort((a, b) => (position.get(a.rule.id) ?? 0) - (position.get(b.rule.id) ?? 0));
  const totalTax = lines.reduce((s, l) => s + l.amount, 0);
  const takeHome = gross - totalTax - pretax - posttax;
  return {
    gross,
    byKind,
    bases: Object.fromEntries(
      Object.entries(household).map(([k, v]) => [k, Math.round(v)]),
    ) as Record<TaxBase, Cents>,
    taxes: lines,
    totalTax,
    pretaxDeductions: pretax,
    posttaxDeductions: posttax,
    takeHome,
    monthlyTakeHome: Math.round(takeHome / 12),
    effectiveRate: gross > 0 ? totalTax / gross : 0,
    error: order
      ? null
      : 'Two or more taxes subtract each other, so they can’t be calculated. Check “Less other taxes”.',
  };
}

const MARGINAL_STEP = 100_00; // $100

/** The scenario's yearly savings, or 0 when savings are switched off. */
export function scenarioSavings(scenario: Pick<PlannerScenario, 'savings' | 'savingsDisabled'>) {
  return scenario.savingsDisabled ? 0 : (scenario.savings ?? 0);
}

/** Calculates take-home pay; incomes, deductions and taxes marked `disabled` are left out. */
export function computeScenario(
  input: Pick<PlannerScenario, 'incomes' | 'deductions' | 'taxes'> &
    Partial<Pick<PlannerScenario, 'people'>>,
): PlannerResult {
  const scenario = {
    ...input,
    incomes: input.incomes.filter((i) => !i.disabled),
    deductions: input.deductions.filter((d) => !d.disabled),
    taxes: input.taxes.filter((t) => !t.disabled),
  };
  const result = compute(scenario);
  const largest = [...scenario.incomes].sort((a, b) => b.annual - a.annual)[0];
  let marginalRate = 0;
  if (largest) {
    const bumped = compute({
      ...scenario,
      incomes: scenario.incomes.map((i) =>
        i === largest ? { ...i, annual: i.annual + MARGINAL_STEP } : i,
      ),
    });
    marginalRate = (bumped.totalTax - result.totalTax) / MARGINAL_STEP;
  }
  return { ...result, marginalRate };
}

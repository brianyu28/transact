/**
 * Moving a scenario's template tax rules to another tax year's figures.
 *
 * Each rule is identified by its `template` tag, or, for rules from before tags existed,
 * by matching its figures against every published year (then by its default name). A rule
 * whose figures still equal what the template produced for its year is unedited and is
 * updated automatically; an edited rule is only replaced when the user asks. Rules that
 * didn't come from the template (a state tax, custom rules) are never touched.
 */
import type { Cents, Id, TaxRule, TemplateRuleKey } from '../schema/types';
import { TEMPLATE_RULE_NAMES, templateRuleFigures, type RuleFigures } from './templates';
import { US_TAX_YEARS, usTaxYear, type FilingStatus } from './taxYears';

const KEYS = Object.keys(TEMPLATE_RULE_NAMES) as TemplateRuleKey[];
/** Keys whose figures differ by filing status. */
const BY_FILING = new Set<TemplateRuleKey>(['federalIncome', 'additionalMedicare']);

export type FigureChange =
  | { field: 'deduction' | 'cap' | 'threshold'; from: Cents | undefined; to: Cents | undefined }
  | { field: 'rate' | 'baseFactor'; from: number | undefined; to: number | undefined }
  | { field: 'brackets' | 'other' };

export interface RuleUpdate {
  ruleId: Id;
  name: string;
  key: TemplateRuleKey;
  /** The year whose figures the rule was set up with; null when that can't be told. */
  fromYear: number | null;
  /**
   * `update`: unedited, and the new year's figures differ. `unchanged`: unedited, same
   * figures. `edited`: the user changed it, so it's replaced only on request.
   */
  status: 'update' | 'unchanged' | 'edited';
  /** What replacing the rule with `next` changes. */
  changes: FigureChange[];
  next: TaxRule;
}

export interface TaxYearUpdatePlan {
  year: number;
  updates: RuleUpdate[];
}

function figuresOf(rule: TaxRule | RuleFigures): RuleFigures {
  const out: RuleFigures = { base: rule.base, schedule: rule.schedule };
  if (rule.baseFactor !== undefined) out.baseFactor = rule.baseFactor;
  if (rule.deduction !== undefined) out.deduction = rule.deduction;
  if (rule.cap !== undefined) out.cap = rule.cap;
  if (rule.capReducedBy !== undefined) out.capReducedBy = rule.capReducedBy;
  if (rule.threshold !== undefined) out.threshold = rule.threshold;
  if (rule.perPerson) out.perPerson = true;
  return out;
}

const fingerprint = (f: RuleFigures) =>
  JSON.stringify([
    f.base,
    f.baseFactor,
    f.deduction,
    f.cap,
    f.capReducedBy,
    f.threshold,
    f.perPerson,
    f.schedule,
  ]);

const sameFigures = (a: TaxRule | RuleFigures, b: RuleFigures) =>
  fingerprint(figuresOf(a)) === fingerprint(figuresOf(b));

interface Identity {
  key: TemplateRuleKey;
  year: number | null;
  filing: FilingStatus | null;
}

/** Which template rule this is, from its tag, its figures, or its default name. */
function identify(rule: TaxRule): Identity | null {
  if (rule.template) return rule.template;
  for (const figures of US_TAX_YEARS)
    for (const filing of ['single', 'mfj'] as const)
      for (const key of KEYS)
        if (sameFigures(rule, templateRuleFigures(key, figures, filing)))
          return { key, year: figures.year, filing: BY_FILING.has(key) ? filing : null };
  const key = KEYS.find((k) => TEMPLATE_RULE_NAMES[k] === rule.name);
  return key ? { key, year: null, filing: null } : null;
}

function diff(rule: TaxRule, next: RuleFigures): FigureChange[] {
  const a = figuresOf(rule);
  const changes: FigureChange[] = [];
  for (const field of ['deduction', 'cap', 'threshold'] as const)
    if (a[field] !== next[field]) changes.push({ field, from: a[field], to: next[field] });
  if (a.baseFactor !== next.baseFactor)
    changes.push({ field: 'baseFactor', from: a.baseFactor, to: next.baseFactor });
  const rate = (f: RuleFigures) => (f.schedule.kind === 'flat' ? f.schedule.rate : undefined);
  if (a.schedule.kind === 'brackets' && next.schedule.kind === 'brackets') {
    if (JSON.stringify(a.schedule) !== JSON.stringify(next.schedule))
      changes.push({ field: 'brackets' });
  } else if (a.schedule.kind === 'flat' && next.schedule.kind === 'flat') {
    if (rate(a) !== rate(next)) changes.push({ field: 'rate', from: rate(a), to: rate(next) });
  } else changes.push({ field: 'brackets' });
  if (
    a.base !== next.base ||
    a.capReducedBy !== next.capReducedBy ||
    Boolean(a.perPerson) !== Boolean(next.perPerson)
  )
    changes.push({ field: 'other' });
  return changes;
}

/**
 * What updating `taxes` to `year`'s published figures would do, or null if that year
 * isn't published. Rules that didn't come from the template are left out.
 */
export function planTaxYearUpdate(
  taxes: readonly TaxRule[],
  year: number,
): TaxYearUpdatePlan | null {
  const target = usTaxYear(year);
  if (!target) return null;
  const identified = taxes.flatMap((rule) => {
    const id = identify(rule);
    return id ? [{ rule, id }] : [];
  });
  // Filing status comes from the rules whose figures depend on it; joint filers' federal
  // brackets give it away even when other rules were edited.
  const filing: FilingStatus =
    identified.find(({ id }) => id.filing !== null && BY_FILING.has(id.key))?.id.filing ?? 'single';
  const updates = identified.map(({ rule, id }): RuleUpdate => {
    const ruleFiling = id.filing ?? filing;
    const from = id.year === null ? undefined : usTaxYear(id.year);
    const pristine =
      from !== undefined && sameFigures(rule, templateRuleFigures(id.key, from, ruleFiling));
    const figures = templateRuleFigures(id.key, target, ruleFiling);
    const next: TaxRule = {
      id: rule.id,
      name: rule.name,
      ...figures,
      ...(rule.lessTaxes ? { lessTaxes: rule.lessTaxes } : {}),
      template: { key: id.key, year: target.year, filing: ruleFiling },
    };
    const changes = diff(rule, figures);
    return {
      ruleId: rule.id,
      name: rule.name,
      key: id.key,
      fromYear: id.year,
      status: !pristine ? 'edited' : changes.length ? 'update' : 'unchanged',
      changes,
      next,
    };
  });
  return { year: target.year, updates };
}

/** Whether the plan has anything for the user to review (not just retagging). */
export function needsTaxYearUpdate(plan: TaxYearUpdatePlan | null): boolean {
  return (
    plan?.updates.some(
      (u) =>
        u.status === 'update' ||
        (u.status === 'edited' && u.fromYear !== null && u.fromYear !== plan.year),
    ) ?? false
  );
}

/**
 * Applies a plan: unedited rules take the new figures, edited ones only when listed in
 * `replace`. Edited rules that are kept are marked as reviewed for the new year.
 */
export function applyTaxYearUpdate(
  taxes: readonly TaxRule[],
  plan: TaxYearUpdatePlan,
  replace: ReadonlySet<Id>,
): TaxRule[] {
  const byId = new Map(plan.updates.map((u) => [u.ruleId, u]));
  return taxes.map((rule) => {
    const u = byId.get(rule.id);
    if (!u) return rule;
    if (u.status !== 'edited' || replace.has(rule.id)) return u.next;
    return u.next.template ? { ...rule, template: u.next.template } : rule;
  });
}

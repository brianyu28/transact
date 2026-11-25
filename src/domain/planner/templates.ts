/**
 * Starting points for tax rules. These are editable defaults, not tax advice. The
 * published figures for each tax year live in `taxYears/`; this file only turns them
 * into rules, so nothing here changes from year to year.
 */
import type { IdKind } from '@/lib/id';
import type { Cents, Id, PlannerScenario, TaxRule, TemplateRuleKey } from '../schema/types';
import { usTaxYearFor, type FilingStatus, type UsTaxYear } from './taxYears';

export type { FilingStatus } from './taxYears';

const $ = (dollars: number): Cents => Math.round(dollars * 100);

export interface TemplateOptions {
  filing: FilingStatus;
  /** Include self-employment tax rules (for 1099 income). */
  selfEmployment: boolean;
  /** Flat state income tax rate (0 for none). */
  stateRate: number;
}

/** Default names of the rules the template creates. */
export const TEMPLATE_RULE_NAMES: Record<TemplateRuleKey, string> = {
  seSocialSecurity: 'Self-employment Social Security',
  seMedicare: 'Self-employment Medicare',
  federalIncome: 'Federal income tax',
  socialSecurity: 'Social Security',
  medicare: 'Medicare',
  additionalMedicare: 'Additional Medicare',
};

/** The parts of a rule that come from a tax year's figures. */
export type RuleFigures = Omit<TaxRule, 'id' | 'name' | 'lessTaxes' | 'template'>;

/** One template rule's figures for a tax year and filing status. */
export function templateRuleFigures(
  key: TemplateRuleKey,
  figures: UsTaxYear,
  filing: FilingStatus,
): RuleFigures {
  const { socialSecurity, medicare, selfEmployment: se } = figures;
  switch (key) {
    case 'seSocialSecurity':
      return {
        base: 'seEarnings',
        baseFactor: se.earningsFactor,
        cap: $(socialSecurity.wageBase),
        capReducedBy: 'wages',
        perPerson: true,
        schedule: { kind: 'flat', rate: se.socialSecurityRate },
      };
    case 'seMedicare':
      return {
        base: 'seEarnings',
        baseFactor: se.earningsFactor,
        perPerson: true,
        schedule: { kind: 'flat', rate: se.medicareRate },
      };
    case 'federalIncome': {
      const federal = figures.federal[filing];
      return {
        base: 'taxableIncome',
        deduction: $(federal.standardDeduction),
        schedule: {
          kind: 'brackets',
          brackets: federal.brackets.map(([upTo, rate]) => ({
            upTo: upTo === null ? null : $(upTo),
            rate,
          })),
        },
      };
    }
    case 'socialSecurity':
      return {
        base: 'wages',
        cap: $(socialSecurity.wageBase),
        perPerson: true,
        schedule: { kind: 'flat', rate: socialSecurity.rate },
      };
    case 'medicare':
      return {
        base: 'wages',
        perPerson: true,
        schedule: { kind: 'flat', rate: medicare.rate },
      };
    // A household rule: for joint filers the threshold applies to combined wages.
    case 'additionalMedicare':
      return {
        base: 'wages',
        threshold: $(medicare.additionalThreshold[filing]),
        schedule: { kind: 'flat', rate: medicare.additionalRate },
      };
  }
}

/**
 * US federal income tax, payroll taxes, optional self-employment tax and a flat state tax,
 * using the figures for `year` (see `usTaxYearFor`). Each rule except the state tax is
 * tagged with its template key and tax year.
 */
export function usTaxRules(
  options: TemplateOptions,
  year: number,
  newId: (kind: IdKind) => Id,
): TaxRule[] {
  const figures = usTaxYearFor(year);
  const { filing } = options;
  const rule = (key: TemplateRuleKey, id: Id = newId('plannerItem')): TaxRule => ({
    id,
    name: TEMPLATE_RULE_NAMES[key],
    ...templateRuleFigures(key, figures, filing),
    template: { key, year: figures.year, filing },
  });
  const rules: TaxRule[] = [];
  const seSocialSecurity = newId('plannerItem');
  const seMedicare = newId('plannerItem');
  if (options.selfEmployment)
    rules.push(rule('seSocialSecurity', seSocialSecurity), rule('seMedicare', seMedicare));
  const share = figures.selfEmployment.deductibleShare;
  rules.push({
    ...rule('federalIncome'),
    ...(options.selfEmployment
      ? {
          lessTaxes: [
            { taxId: seSocialSecurity, fraction: share },
            { taxId: seMedicare, fraction: share },
          ],
        }
      : {}),
  });
  if (options.stateRate > 0) {
    rules.push({
      id: newId('plannerItem'),
      name: 'State income tax',
      base: 'taxableIncome',
      schedule: { kind: 'flat', rate: options.stateRate },
    });
  }
  rules.push(rule('socialSecurity'), rule('medicare'), rule('additionalMedicare'));
  return rules;
}

/**
 * A starting scenario: salaries, common pre-tax deductions (zeroed), and US tax rules.
 * Joint filers get two people, each with their own salary and 401(k).
 */
export function scenarioTemplate(
  options: TemplateOptions & { name: string; year: number; now: string },
  newId: (kind: IdKind) => Id,
): PlannerScenario {
  const people =
    options.filing === 'mfj'
      ? [
          { id: newId('plannerItem'), name: 'Partner 1' },
          { id: newId('plannerItem'), name: 'Partner 2' },
        ]
      : [];
  const owners = people.length ? people : [undefined];
  return {
    id: newId('plannerScenario'),
    name: options.name,
    year: options.year,
    ...(people.length ? { people } : {}),
    incomes: owners.map((p) => ({
      id: newId('plannerItem'),
      name: p ? `${p.name} salary` : 'Salary',
      kind: 'w2' as const,
      annual: 0,
      ...(p ? { person: p.id } : {}),
    })),
    deductions: [
      ...owners.map((p) => ({
        id: newId('plannerItem'),
        name: p ? `${p.name} 401(k)` : '401(k)',
        annual: 0,
        pretax: true,
        reduces: ['taxableIncome' as const],
        ...(p ? { person: p.id } : {}),
      })),
      {
        id: newId('plannerItem'),
        name: 'Health insurance',
        annual: 0,
        pretax: true,
        reduces: ['wages', 'taxableIncome'],
      },
    ],
    taxes: usTaxRules(options, options.year, newId),
    updatedAt: options.now,
  };
}

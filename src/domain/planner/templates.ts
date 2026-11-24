/**
 * Starting points for tax rules. These are editable defaults, not tax advice: rates and
 * limits change every year and vary by state, so the planner labels them "verify for
 * your situation". Figures are for US tax year 2026 as published by the IRS and SSA.
 */
import type { IdKind } from '@/lib/id';
import type { Cents, Id, PlannerScenario, TaxRule } from '../schema/types';

export type FilingStatus = 'single' | 'mfj';

const $ = (dollars: number): Cents => Math.round(dollars * 100);

const FEDERAL_2026: Record<
  FilingStatus,
  { standard: number; brackets: [number | null, number][] }
> = {
  single: {
    standard: 16_100,
    brackets: [
      [12_400, 0.1],
      [50_400, 0.12],
      [105_700, 0.22],
      [201_775, 0.24],
      [256_225, 0.32],
      [640_600, 0.35],
      [null, 0.37],
    ],
  },
  mfj: {
    standard: 32_200,
    brackets: [
      [24_800, 0.1],
      [100_800, 0.12],
      [211_400, 0.22],
      [403_550, 0.24],
      [512_450, 0.32],
      [768_700, 0.35],
      [null, 0.37],
    ],
  },
};

const SOCIAL_SECURITY_WAGE_BASE_2026 = 184_500;
const ADDITIONAL_MEDICARE_THRESHOLD: Record<FilingStatus, number> = {
  single: 200_000,
  mfj: 250_000,
};

export interface TemplateOptions {
  filing: FilingStatus;
  /** Include self-employment tax rules (for 1099 income). */
  selfEmployment: boolean;
  /** Flat state income tax rate (0 for none). */
  stateRate: number;
}

/** US federal income tax, payroll taxes, optional self-employment tax and a flat state tax. */
export function usTaxRules(options: TemplateOptions, newId: (kind: IdKind) => Id): TaxRule[] {
  const id = () => newId('plannerItem');
  const rules: TaxRule[] = [];
  const seSocialSecurity = id();
  const seMedicare = id();
  if (options.selfEmployment) {
    rules.push(
      {
        id: seSocialSecurity,
        name: 'Self-employment Social Security',
        base: 'seEarnings',
        baseFactor: 0.9235,
        cap: $(SOCIAL_SECURITY_WAGE_BASE_2026),
        capReducedBy: 'wages',
        perPerson: true,
        schedule: { kind: 'flat', rate: 0.124 },
      },
      {
        id: seMedicare,
        name: 'Self-employment Medicare',
        base: 'seEarnings',
        baseFactor: 0.9235,
        perPerson: true,
        schedule: { kind: 'flat', rate: 0.029 },
      },
    );
  }
  const federal = FEDERAL_2026[options.filing];
  rules.push({
    id: id(),
    name: 'Federal income tax',
    base: 'taxableIncome',
    deduction: $(federal.standard),
    schedule: {
      kind: 'brackets',
      brackets: federal.brackets.map(([upTo, rate]) => ({
        upTo: upTo === null ? null : $(upTo),
        rate,
      })),
    },
    ...(options.selfEmployment
      ? {
          lessTaxes: [
            { taxId: seSocialSecurity, fraction: 0.5 },
            { taxId: seMedicare, fraction: 0.5 },
          ],
        }
      : {}),
  });
  if (options.stateRate > 0) {
    rules.push({
      id: id(),
      name: 'State income tax',
      base: 'taxableIncome',
      schedule: { kind: 'flat', rate: options.stateRate },
    });
  }
  rules.push(
    {
      id: id(),
      name: 'Social Security',
      base: 'wages',
      cap: $(SOCIAL_SECURITY_WAGE_BASE_2026),
      perPerson: true,
      schedule: { kind: 'flat', rate: 0.062 },
    },
    {
      id: id(),
      name: 'Medicare',
      base: 'wages',
      perPerson: true,
      schedule: { kind: 'flat', rate: 0.0145 },
    },
    // A household rule: for joint filers the threshold applies to combined wages.
    {
      id: id(),
      name: 'Additional Medicare',
      base: 'wages',
      threshold: $(ADDITIONAL_MEDICARE_THRESHOLD[options.filing]),
      schedule: { kind: 'flat', rate: 0.009 },
    },
  );
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
    taxes: usTaxRules(options, newId),
    updatedAt: options.now,
  };
}

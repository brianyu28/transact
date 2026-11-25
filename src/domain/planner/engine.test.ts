import { describe, expect, it } from 'vitest';
import type { PlannerScenario } from '../schema/types';
import { applySchedule, computeScenario } from './engine';
import { US_TAX_YEARS, usTaxYearFor } from './taxYears';
import { usTaxRules } from './templates';

let n = 0;
const newId = () => `pli_${String(n++).padStart(12, '0')}`;
const $ = (d: number) => Math.round(d * 100);

function scenario(
  incomes: PlannerScenario['incomes'],
  options = { selfEmployment: false, stateRate: 0 },
  deductions: PlannerScenario['deductions'] = [],
) {
  return { incomes, deductions, taxes: usTaxRules({ filing: 'single', ...options }, 2026, newId) };
}
const tax = (r: ReturnType<typeof computeScenario>, name: string) =>
  r.taxes.find((t) => t.rule.name === name)?.amount;

describe('tax engine', () => {
  it('applies marginal brackets', () => {
    const brackets = {
      kind: 'brackets' as const,
      brackets: [
        { upTo: 1000, rate: 0.1 },
        { upTo: null, rate: 0.2 },
      ],
    };
    expect(applySchedule(brackets, 500)).toBe(50);
    expect(applySchedule(brackets, 3000)).toBe(100 + 400);
  });

  it('computes federal income and payroll tax on a salary (US 2026, single)', () => {
    const r = computeScenario(
      scenario([{ id: 'pli_a', name: 'Salary', kind: 'w2', annual: $(100_000) }]),
    );
    // Taxable 83,900: 1,240 + 4,560 + 7,370
    expect(tax(r, 'Federal income tax')).toBe($(13_170));
    expect(tax(r, 'Social Security')).toBe($(6_200));
    expect(tax(r, 'Medicare')).toBe($(1_450));
    expect(tax(r, 'Additional Medicare')).toBe(0);
    expect(r.takeHome).toBe($(100_000 - 13_170 - 7_650));
    expect(r.marginalRate).toBeCloseTo(0.22 + 0.0765);
  });

  it('leaves disabled incomes, deductions and taxes out', () => {
    const base = scenario(
      [
        { id: 'pli_a', name: 'Salary', kind: 'w2', annual: $(100_000) },
        { id: 'pli_x', name: 'Bonus', kind: 'w2', annual: $(20_000), disabled: true },
      ],
      { selfEmployment: false, stateRate: 0 },
      [
        {
          id: 'pli_d',
          name: '401(k)',
          annual: $(10_000),
          pretax: true,
          reduces: ['taxableIncome'],
          disabled: true,
        },
      ],
    );
    const r = computeScenario(base);
    expect(r.gross).toBe($(100_000));
    expect(r.pretaxDeductions).toBe(0);
    expect(tax(r, 'Federal income tax')).toBe($(13_170));

    const noMedicare = computeScenario({
      ...base,
      taxes: base.taxes.map((t) => (t.name === 'Medicare' ? { ...t, disabled: true as const } : t)),
    });
    expect(tax(noMedicare, 'Medicare')).toBeUndefined();
    expect(noMedicare.takeHome).toBe(r.takeHome + $(1_450));
  });

  it('caps Social Security and adds Additional Medicare above the threshold', () => {
    const r = computeScenario(
      scenario([{ id: 'pli_a', name: 'Salary', kind: 'w2', annual: $(250_000) }]),
    );
    expect(tax(r, 'Social Security')).toBe($(184_500 * 0.062));
    expect(tax(r, 'Additional Medicare')).toBe($(50_000 * 0.009));
  });

  it('handles self-employment tax, its wage-base interaction and half-deduction', () => {
    const r = computeScenario(
      scenario([{ id: 'pli_b', name: 'Consulting', kind: '1099', annual: $(100_000) }], {
        selfEmployment: true,
        stateRate: 0,
      }),
    );
    expect(tax(r, 'Self-employment Social Security')).toBe($(92_350 * 0.124));
    expect(tax(r, 'Self-employment Medicare')).toBe($(92_350 * 0.029));
    // Income tax base is reduced by half of SE tax (7,064.78) before the standard deduction.
    const taxable = r.taxes.find((t) => t.rule.name === 'Federal income tax')?.taxable;
    expect(taxable).toBe(
      Math.round($(100_000) - 0.5 * $(92_350 * 0.124) - 0.5 * $(92_350 * 0.029) - $(16_100)),
    );

    const both = computeScenario(
      scenario(
        [
          { id: 'pli_a', name: 'Salary', kind: 'w2', annual: $(150_000) },
          { id: 'pli_b', name: 'Consulting', kind: '1099', annual: $(100_000) },
        ],
        { selfEmployment: true, stateRate: 0 },
      ),
    );
    // Only 34,500 of the wage base is left for SE Social Security.
    expect(tax(both, 'Self-employment Social Security')).toBe($(34_500 * 0.124));
  });

  it('applies pre-tax deductions only to the bases they reduce', () => {
    const r = computeScenario(
      scenario(
        [{ id: 'pli_a', name: 'Salary', kind: 'w2', annual: $(100_000) }],
        { selfEmployment: false, stateRate: 0.05 },
        [
          {
            id: 'pli_k',
            name: '401(k)',
            annual: $(20_000),
            pretax: true,
            reduces: ['taxableIncome'],
          },
          { id: 'pli_r', name: 'Roth IRA', annual: $(7_000), pretax: false, reduces: [] },
        ],
      ),
    );
    expect(tax(r, 'Social Security')).toBe($(6_200)); // wages unaffected by 401(k)
    expect(tax(r, 'State income tax')).toBe($(80_000 * 0.05));
    expect(r.takeHome).toBe($(100_000) - r.totalTax - $(27_000));
  });

  it('reports cycles instead of looping', () => {
    const s = scenario([{ id: 'pli_a', name: 'Salary', kind: 'w2', annual: $(1) }]);
    const [a, b] = s.taxes;
    a!.lessTaxes = [{ taxId: b!.id, fraction: 0.5 }];
    b!.lessTaxes = [{ taxId: a!.id, fraction: 0.5 }];
    expect(computeScenario(s).error).toMatch(/subtract each other/);
  });

  describe('married couple with two incomes', () => {
    const people = [
      { id: 'pli_p1', name: 'A' },
      { id: 'pli_p2', name: 'B' },
    ];
    const couple = (
      a: number,
      b: number,
      kindB: 'w2' | '1099' = 'w2',
      deductions: PlannerScenario['deductions'] = [],
    ) => ({
      people,
      incomes: [
        { id: 'pli_a', name: 'A salary', kind: 'w2' as const, annual: $(a), person: 'pli_p1' },
        { id: 'pli_b', name: 'B income', kind: kindB, annual: $(b), person: 'pli_p2' },
      ],
      deductions,
      taxes: usTaxRules({ filing: 'mfj', selfEmployment: true, stateRate: 0 }, 2026, newId),
    });

    it('caps Social Security per person, not on combined wages', () => {
      const r = computeScenario(couple(150_000, 150_000));
      expect(tax(r, 'Social Security')).toBe($(2 * 150_000 * 0.062));
      expect(tax(r, 'Medicare')).toBe($(300_000 * 0.0145));
      // Additional Medicare: the joint threshold (250k) applies to combined wages.
      expect(tax(r, 'Additional Medicare')).toBe($(50_000 * 0.009));
      // Federal: joint brackets on combined taxable income.
      expect(r.taxes.find((t) => t.rule.name === 'Federal income tax')?.taxable).toBe(
        $(300_000 - 32_200),
      );
    });

    it('applies the cap to each earner separately when incomes differ', () => {
      const r = computeScenario(couple(200_000, 50_000));
      expect(tax(r, 'Social Security')).toBe($(184_500 * 0.062 + 50_000 * 0.062));
      expect(tax(r, 'Additional Medicare')).toBe(0); // combined 250k isn't above the threshold
      const line = r.taxes.find((t) => t.rule.name === 'Social Security');
      expect(line?.byPerson?.map((p) => p.amount)).toEqual([$(184_500 * 0.062), $(50_000 * 0.062)]);
    });

    it("reduces self-employment Social Security only by that person's own wages", () => {
      const r = computeScenario(couple(180_000, 100_000, '1099'));
      expect(tax(r, 'Self-employment Social Security')).toBe($(92_350 * 0.124));
      expect(tax(r, 'Social Security')).toBe($(180_000 * 0.062));
    });

    it("applies a person's pre-tax deductions to their own payroll taxes", () => {
      const r = computeScenario(
        couple(100_000, 60_000, 'w2', [
          {
            id: 'pli_h',
            name: 'B health',
            annual: $(5_000),
            pretax: true,
            reduces: ['wages', 'taxableIncome'],
            person: 'pli_p2',
          },
        ]),
      );
      const ss = r.taxes.find((t) => t.rule.name === 'Social Security')?.byPerson;
      expect(ss?.map((p) => p.amount)).toEqual([$(100_000 * 0.062), $(55_000 * 0.062)]);
    });
  });
});

describe('tax years', () => {
  it('uses the latest published year at or before the requested one', () => {
    const first = US_TAX_YEARS[0]!;
    const latest = US_TAX_YEARS.at(-1)!;
    expect(usTaxYearFor(latest.year + 5)).toBe(latest);
    expect(usTaxYearFor(first.year - 5)).toBe(first);
    for (const y of US_TAX_YEARS) expect(usTaxYearFor(y.year)).toBe(y);
  });

  it('lists years oldest first with ascending brackets', () => {
    US_TAX_YEARS.forEach((y, i) => {
      if (i > 0) expect(y.year).toBeGreaterThan(US_TAX_YEARS[i - 1]!.year);
      for (const status of ['single', 'mfj'] as const) {
        const bounds = y.federal[status].brackets.map(([upTo]) => upTo ?? Infinity);
        expect(bounds).toEqual([...bounds].sort((a, b) => a - b));
        expect(bounds.at(-1)).toBe(Infinity);
      }
    });
  });
});

import { describe, expect, it } from 'vitest';
import type { TaxRule } from '../schema/types';
import { applyTaxYearUpdate, needsTaxYearUpdate, planTaxYearUpdate } from './taxYearUpdate';
import { usTaxYear } from './taxYears';
import { templateRuleFigures, usTaxRules } from './templates';

let n = 0;
const newId = () => `pli_${String(n++).padStart(12, '0')}`;
const byName = (rules: readonly TaxRule[], name: string) => rules.find((r) => r.name === name)!;
const untag = (rules: TaxRule[]) =>
  rules.map((r) => {
    const copy = { ...r };
    Reflect.deleteProperty(copy, 'template');
    return copy;
  });
const Y2027 = usTaxYear(2027)!;

describe('tax year update', () => {
  const single = usTaxRules(
    { filing: 'single', selfEmployment: false, stateRate: 0.05 },
    2026,
    newId,
  );

  it('updates unedited template rules and leaves other rules alone', () => {
    const plan = planTaxYearUpdate(single, 2027)!;
    const status = Object.fromEntries(plan.updates.map((u) => [u.name, u.status]));
    expect(status).toEqual({
      'Federal income tax': 'update',
      'Social Security': 'update',
      Medicare: 'unchanged',
      'Additional Medicare': 'unchanged',
    });
    expect(plan.updates.find((u) => u.key === 'socialSecurity')?.changes).toEqual([
      { field: 'cap', from: 184_500_00, to: 192_300_00 },
    ]);
    expect(needsTaxYearUpdate(plan)).toBe(true);

    const updated = applyTaxYearUpdate(single, plan, new Set());
    expect(byName(updated, 'Federal income tax')).toMatchObject({
      ...templateRuleFigures('federalIncome', Y2027, 'single'),
      template: { key: 'federalIncome', year: 2027, filing: 'single' },
    });
    expect(byName(updated, 'State income tax')).toBe(byName(single, 'State income tax'));
    expect(updated.map((r) => r.id)).toEqual(single.map((r) => r.id));
    expect(needsTaxYearUpdate(planTaxYearUpdate(updated, 2027))).toBe(false);
  });

  it('replaces edited rules only on request, keeping names', () => {
    const edited = single.map((r) =>
      r.name === 'Social Security' ? { ...r, name: 'OASDI', cap: 100_000_00 } : r,
    );
    const plan = planTaxYearUpdate(edited, 2027)!;
    const ss = plan.updates.find((u) => u.key === 'socialSecurity')!;
    expect(ss.status).toBe('edited');

    const kept = byName(applyTaxYearUpdate(edited, plan, new Set()), 'OASDI');
    expect(kept.cap).toBe(100_000_00);
    expect(kept.template?.year).toBe(2027);
    expect(
      needsTaxYearUpdate(planTaxYearUpdate(applyTaxYearUpdate(edited, plan, new Set()), 2027)),
    ).toBe(false);

    const replaced = byName(applyTaxYearUpdate(edited, plan, new Set([ss.ruleId])), 'OASDI');
    expect(replaced.cap).toBe(192_300_00);
  });

  it('recognizes untagged rules by their figures, including filing status', () => {
    const joint = untag(
      usTaxRules({ filing: 'mfj', selfEmployment: true, stateRate: 0 }, 2026, newId),
    );
    const plan = planTaxYearUpdate(joint, 2027)!;
    expect(plan.updates).toHaveLength(joint.length);
    const updated = applyTaxYearUpdate(joint, plan, new Set());
    const federal = byName(updated, 'Federal income tax');
    expect(federal.deduction).toBe(33_200_00);
    expect(federal.template).toEqual({ key: 'federalIncome', year: 2027, filing: 'mfj' });
    // "Less other taxes" still points at the self-employment rules.
    expect(federal.lessTaxes).toEqual(byName(joint, 'Federal income tax').lessTaxes);
    expect(byName(updated, 'Self-employment Social Security').cap).toBe(192_300_00);
  });

  it('treats an untagged, edited rule with its default name as edited', () => {
    const rules = untag(single).map((r) => (r.name === 'Medicare' ? { ...r, threshold: 1 } : r));
    const medicare = planTaxYearUpdate(rules, 2027)!.updates.find((u) => u.key === 'medicare');
    expect(medicare).toMatchObject({ status: 'edited', fromYear: null });
  });

  it('needs published figures', () => {
    expect(planTaxYearUpdate(single, 1990)).toBeNull();
  });
});

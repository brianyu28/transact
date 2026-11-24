import type { Migration } from './index';

/**
 * v1 → v2: planner additions, all optional so existing data needs no changes:
 *   - tax rules: `capReducedBy`, `lessTaxes` (self-employment tax), `perPerson`
 *   - scenarios: `people`, with `person` on incomes and deductions (two-earner households)
 * The version bump makes older app versions refuse v2 files instead of silently
 * dropping the new fields.
 */
export const v1ToV2: Migration = {
  from: 1,
  to: 2,
  description:
    'Planner: per-person taxes, people, cap reductions and deductible fractions of taxes',
  migrate: (doc) => doc,
};

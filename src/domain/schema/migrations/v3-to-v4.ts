import type { Migration } from './index';

/**
 * v3 → v4: optional additions, so existing data needs no changes:
 *   - planner scenarios: `description`, `savingsDisabled`, and `disabled` on incomes,
 *     deductions and tax rules (left out of the calculation without deleting them)
 *   - default budget lines: `note`
 * The version bump makes older app versions refuse v4 files instead of silently dropping
 * the fields.
 */
export const v3ToV4: Migration = {
  from: 3,
  to: 4,
  description: 'Planner: description and disabled lines; notes on default budget lines',
  migrate: (doc) => doc,
};

import type { Migration } from './index';

/**
 * v2 → v3: planner additions, all optional so existing data needs no changes:
 *   - scenarios: `savings`, set aside from take-home pay
 *   - tax rules: `template`, the template rule and tax year they were set up from
 * Untagged rules from v2 are recognized by their figures when updating a tax year. The version bump makes older app versions refuse v3 files instead of silently
 * dropping the field.
 */
export const v2ToV3: Migration = {
  from: 2,
  to: 3,
  description: 'Planner: savings, and tax rules tagged with their template and tax year',
  migrate: (doc) => doc,
};

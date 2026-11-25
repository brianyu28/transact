import type { Migration } from './index';

/**
 * v4 → v5: optional `plan` items on default, period and custom budget lines, so existing
 * data needs no changes. The version bump makes older app versions refuse v5 files instead
 * of silently dropping the plans.
 */
export const v4ToV5: Migration = {
  from: 4,
  to: 5,
  description: 'Planning items on budget lines',
  migrate: (doc) => doc,
};

import type { Id } from '@/domain/schema/types';

/**
 * Value encoding for category-or-transfer pickers:
 * '' = uncategorized, 'cat:<id>' = a category, 'xfer:<accountId>' = transfer to/from an account.
 */
export type CategoryValue = string;

export const categoryValue = (id: Id | undefined) => (id ? `cat:${id}` : '');
export const transferValue = (accountId: Id) => `xfer:${accountId}`;

export function parseCategoryValue(value: CategoryValue): {
  categoryId: Id | null;
  transferAccountId: Id | null;
} {
  if (value.startsWith('cat:')) return { categoryId: value.slice(4), transferAccountId: null };
  if (value.startsWith('xfer:')) return { categoryId: null, transferAccountId: value.slice(5) };
  return { categoryId: null, transferAccountId: null };
}

import type { AccountType } from '@/domain/schema/types';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Checking',
  savings: 'Savings',
  credit: 'Credit card',
  brokerage: 'Brokerage',
  retirement: 'Retirement',
  cash: 'Cash',
  loan: 'Loan',
  property: 'Property',
  other: 'Other',
};

export const ACCOUNT_TYPE_OPTIONS = Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

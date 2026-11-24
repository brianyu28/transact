import type { AccountType } from '@/domain/schema/types';

export interface AccountGroup {
  id: string;
  title: string;
  types: readonly AccountType[];
  liability: boolean;
}

/** How accounts are grouped on the Accounts screen. */
export const ACCOUNT_GROUPS: readonly AccountGroup[] = [
  { id: 'cash', title: 'Cash', types: ['checking', 'savings', 'cash'], liability: false },
  { id: 'investments', title: 'Investments', types: ['brokerage', 'retirement'], liability: false },
  { id: 'other-assets', title: 'Property & other', types: ['property', 'other'], liability: false },
  { id: 'credit', title: 'Credit cards', types: ['credit'], liability: true },
  { id: 'loans', title: 'Loans', types: ['loan'], liability: true },
];

export const INVESTMENT_TYPES: ReadonlySet<AccountType> = new Set([
  'brokerage',
  'retirement',
  'property',
]);

import type { Account } from '@/domain/schema/types';
import { registerActions } from '@/features/transactions/registerStore';

/** Filter text that selects exactly this account in the register. */
export function accountQuery(account: Pick<Account, 'name'>): string {
  return `acct:"${account.name}"`;
}

/** Points the register at one account (the caller navigates to /transactions). */
export function filterRegisterToAccount(account: Pick<Account, 'name'>): void {
  registerActions.setQuery(accountQuery(account));
}

import type { Account, AccountType } from '../schema/types';
import { applyChanges, defineCommand, required } from './define';

export const createAccount = defineCommand<
  { name: string; type: AccountType; institution?: string },
  string
>({
  label: 'Add account',
  run(draft, { name, type, institution }, { now, newId }) {
    const order = Math.max(-1, ...Object.values(draft.accounts).map((a) => a.order)) + 1;
    const account: Account = {
      id: newId('account'),
      name: name.trim(),
      type,
      order,
      updatedAt: now,
    };
    if (institution?.trim()) account.institution = institution.trim();
    draft.accounts[account.id] = account;
    return account.id;
  },
});

export type AccountChanges = {
  [K in 'name' | 'type' | 'institution' | 'note' | 'closed' | 'order']?: Account[K] | undefined;
};

export const updateAccount = defineCommand<{ id: string; changes: AccountChanges }>({
  label: 'Edit account',
  run(draft, { id, changes }, { now }) {
    const account = required(draft.accounts[id], 'Account');
    applyChanges(account, changes);
    account.updatedAt = now;
  },
});

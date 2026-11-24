import { original } from 'immer';
import { iterateTransactions, type DocModel } from '../model';
import type { Account, AccountType, Id } from '../schema/types';
import { applyChanges, CommandError, defineCommand, required, tombstone } from './define';

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
  [K in 'name' | 'type' | 'institution' | 'note' | 'closed']?: Account[K] | undefined;
};

export const updateAccount = defineCommand<{ id: Id; changes: AccountChanges }>({
  label: 'Edit account',
  run(draft, { id, changes }, { now }) {
    const account = required(draft.accounts[id], 'Account');
    applyChanges(account, {
      ...changes,
      ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
      ...(changes.institution !== undefined
        ? { institution: changes.institution.trim() || undefined }
        : {}),
    });
    account.updatedAt = now;
  },
});

/** Sets the display order of accounts to the given id order (e.g. after drag and drop). */
export const reorderAccounts = defineCommand<{ ids: readonly Id[] }>({
  label: 'Reorder accounts',
  run(draft, { ids }, { now }) {
    for (const id of ids) required(draft.accounts[id], 'Account');
    ids.forEach((id, order) => {
      const account = draft.accounts[id];
      if (account && account.order !== order) {
        account.order = order;
        account.updatedAt = now;
      }
    });
  },
});

/** Deletes an account that has no transactions, snapshots or statements (otherwise close it). */
export const deleteAccount = defineCommand<{ id: Id }>({
  label: 'Delete account',
  run(draft, { id }, { now }) {
    required(draft.accounts[id], 'Account');
    const base: DocModel = original(draft);
    for (const t of iterateTransactions(base)) {
      if (t.accountId === id)
        throw new CommandError('This account has transactions. Close it instead.');
    }
    const inUse = [...Object.values(base.balanceSnapshots), ...Object.values(base.statements)].some(
      (x) => x.accountId === id,
    );
    if (inUse) throw new CommandError('This account has balance history. Close it instead.');
    Reflect.deleteProperty(draft.accounts, id);
    tombstone(draft, id, now);
  },
});

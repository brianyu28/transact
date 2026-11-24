import { getTransaction, putTransaction, removeTransaction } from '../model';
import type { Cents, ISODate, Id, Transaction } from '../schema/types';
import { applyChanges, CommandError, defineCommand, required, tombstone } from './define';

export interface NewTransaction {
  accountId: Id;
  date: ISODate;
  payee: string;
  amount: Cents;
  categoryId?: Id;
  tags?: Id[];
  note?: string;
}

export const createTransaction = defineCommand<NewTransaction, Id>({
  label: 'Add transaction',
  run(draft, input, { now, newId }) {
    required(draft.accounts[input.accountId], 'Account');
    if (input.categoryId !== undefined) required(draft.categories[input.categoryId], 'Category');
    const t: Transaction = {
      id: newId('transaction'),
      accountId: input.accountId,
      date: input.date,
      payee: input.payee.trim(),
      amount: input.amount,
      createdAt: now,
      updatedAt: now,
    };
    applyChanges(t, {
      categoryId: input.categoryId,
      tags: input.tags,
      note: input.note?.trim() || undefined,
    });
    putTransaction(draft, t);
    return t.id;
  },
});

type EditableKey =
  | 'accountId'
  | 'date'
  | 'payee'
  | 'amount'
  | 'categoryId'
  | 'excluded'
  | 'tags'
  | 'note'
  | 'reconciled';
export type TransactionChanges = { [K in EditableKey]?: Transaction[K] | undefined };

export const updateTransaction = defineCommand<{ id: Id; changes: TransactionChanges }>({
  label: 'Edit transaction',
  run(draft, { id, changes }, { now }) {
    const t = required(getTransaction(draft, id), 'Transaction');
    if (changes.accountId !== undefined) required(draft.accounts[changes.accountId], 'Account');
    if (changes.categoryId !== undefined) {
      required(draft.categories[changes.categoryId], 'Category');
      if (t.splits) throw new CommandError('Split transactions are categorized per split');
    }
    if (t.splits && changes.amount !== undefined && changes.amount !== t.amount) {
      throw new CommandError('Edit the splits to change the amount of a split transaction');
    }
    applyChanges(t, changes);
    t.updatedAt = now;
  },
});

export const deleteTransactions = defineCommand<{ ids: readonly Id[] }>({
  label: 'Delete transactions',
  run(draft, { ids }, { now }) {
    const toDelete = new Set<Id>();
    for (const id of ids) {
      const t = required(getTransaction(draft, id), 'Transaction');
      toDelete.add(id);
      // Transfers are two linked transactions; deleting one side deletes both.
      if (t.transfer) toDelete.add(t.transfer.peerId);
    }
    for (const id of toDelete) {
      if (removeTransaction(draft, id)) tombstone(draft, id, now);
    }
  },
});

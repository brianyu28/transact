import type { Draft } from 'immer';
import { getTransaction, putTransaction, removeTransaction, type DocModel } from '../model';
import type { Cents, ISODate, Id, Split, Transaction } from '../schema/types';
import {
  applyChanges,
  CommandError,
  defineCommand,
  required,
  tombstone,
  type CommandContext,
} from './define';

export interface NewTransaction {
  accountId: Id;
  date: ISODate;
  payee: string;
  amount: Cents;
  categoryId?: Id;
  tags?: Id[];
  note?: string;
  /** Makes this a transfer: a linked opposite transaction is created in this account. */
  transferAccountId?: Id;
}

function validateRefs(
  draft: Draft<DocModel>,
  refs: {
    accountId?: Id | undefined;
    categoryId?: Id | undefined;
    tags?: readonly Id[] | undefined;
  },
) {
  if (refs.accountId !== undefined) required(draft.accounts[refs.accountId], 'Account');
  if (refs.categoryId !== undefined) required(draft.categories[refs.categoryId], 'Category');
  for (const tag of refs.tags ?? []) required(draft.tags[tag], 'Tag');
}

/** Creates the linked counterpart of `t` in `accountId`. */
function createPeer(
  draft: Draft<DocModel>,
  t: Draft<Transaction>,
  accountId: Id,
  ctx: CommandContext,
) {
  required(draft.accounts[accountId], 'Account');
  if (accountId === t.accountId) throw new CommandError('A transfer needs two different accounts.');
  if (t.splits) throw new CommandError('Split transactions can’t be transfers.');
  const peer: Transaction = {
    id: ctx.newId('transaction'),
    accountId,
    date: t.date,
    payee: t.payee,
    amount: -t.amount,
    transfer: { peerId: t.id },
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  putTransaction(draft, peer);
  t.transfer = { peerId: peer.id };
  Reflect.deleteProperty(t, 'categoryId');
}

export const createTransaction = defineCommand<NewTransaction, Id>({
  label: 'Add transaction',
  run(draft, input, ctx) {
    validateRefs(draft, input);
    const t: Transaction = {
      id: ctx.newId('transaction'),
      accountId: input.accountId,
      date: input.date,
      payee: input.payee.trim(),
      amount: input.amount,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    };
    applyChanges(t, {
      categoryId: input.categoryId,
      tags: input.tags,
      note: input.note?.trim() || undefined,
    });
    putTransaction(draft, t);
    if (input.transferAccountId !== undefined) {
      createPeer(
        draft,
        required(getTransaction(draft, t.id), 'Transaction'),
        input.transferAccountId,
        ctx,
      );
    }
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

function applyTransactionChanges(
  draft: Draft<DocModel>,
  t: Draft<Transaction>,
  changes: TransactionChanges,
  now: string,
) {
  validateRefs(draft, changes);
  if (changes.categoryId !== undefined) {
    if (t.splits) throw new CommandError('Split transactions are categorized per split.');
    if (t.transfer) throw new CommandError('Transfers don’t have a category.');
  }
  if (t.splits && changes.amount !== undefined && changes.amount !== t.amount) {
    throw new CommandError('Edit the splits to change the amount of a split transaction.');
  }
  const peer = t.transfer ? getTransaction(draft, t.transfer.peerId) : undefined;
  if (peer && changes.accountId === peer.accountId) {
    throw new CommandError('A transfer needs two different accounts.');
  }
  applyChanges(t, {
    ...changes,
    ...(changes.payee !== undefined ? { payee: changes.payee.trim() } : {}),
    ...('note' in changes ? { note: changes.note?.trim() || undefined } : {}),
  });
  t.updatedAt = now;
  // The two sides of a transfer always move the same amount.
  if (peer && changes.amount !== undefined && peer.amount !== -changes.amount) {
    peer.amount = -changes.amount;
    peer.updatedAt = now;
  }
}

export const updateTransaction = defineCommand<{ id: Id; changes: TransactionChanges }>({
  label: 'Edit transaction',
  run(draft, { id, changes }, { now }) {
    applyTransactionChanges(
      draft,
      required(getTransaction(draft, id), 'Transaction'),
      changes,
      now,
    );
  },
});

export interface BulkChanges {
  /** A category, or null to clear it. */
  categoryId?: Id | null;
  addTags?: Id[];
  /** Tags to add by name (created if they don't exist). */
  addTagNames?: string[];
  removeTags?: Id[];
  reconciled?: boolean;
  excluded?: boolean;
}

/**
 * Applies the same change to many transactions as one undoable step. Category changes
 * skip split transactions and transfers (which don't have a single category).
 */
export const updateTransactions = defineCommand<
  { ids: readonly Id[]; changes: BulkChanges },
  number
>({
  label: 'Edit transactions',
  run(draft, { ids, changes }, { now, newId }) {
    validateRefs(draft, { categoryId: changes.categoryId ?? undefined, tags: changes.addTags });
    const addTags = [...(changes.addTags ?? [])];
    if (changes.addTagNames?.length) {
      const byName = new Map(Object.values(draft.tags).map((t) => [t.name.toLowerCase(), t.id]));
      for (const raw of changes.addTagNames) {
        const name = raw.trim();
        if (!name) continue;
        let tagId = byName.get(name.toLowerCase());
        if (!tagId) {
          tagId = newId('tag');
          draft.tags[tagId] = { id: tagId, name, updatedAt: now };
          byName.set(name.toLowerCase(), tagId);
        }
        addTags.push(tagId);
      }
    }
    let updated = 0;
    for (const id of ids) {
      const t = required(getTransaction(draft, id), 'Transaction');
      const next: TransactionChanges = {};
      if (changes.categoryId !== undefined && !t.splits && !t.transfer) {
        next.categoryId = changes.categoryId ?? undefined;
      }
      if (addTags.length || changes.removeTags) {
        const tags = new Set(t.tags ?? []);
        for (const tag of addTags) tags.add(tag);
        for (const tag of changes.removeTags ?? []) tags.delete(tag);
        next.tags = [...tags];
      }
      if (changes.reconciled !== undefined) next.reconciled = changes.reconciled ? true : undefined;
      if (changes.excluded !== undefined) next.excluded = changes.excluded ? true : undefined;
      if (Object.keys(next).length === 0) continue;
      applyTransactionChanges(draft, t, next, now);
      updated++;
    }
    return updated;
  },
});

/**
 * Makes a transaction a transfer to/from another account (creating or moving the linked
 * counterpart), or with `accountId: null` turns a transfer back into a regular transaction
 * (deleting the counterpart).
 */
export const setTransferAccount = defineCommand<{ id: Id; accountId: Id | null }>({
  label: 'Change transfer',
  run(draft, { id, accountId }, ctx) {
    const t = required(getTransaction(draft, id), 'Transaction');
    const peer = t.transfer ? getTransaction(draft, t.transfer.peerId) : undefined;
    if (accountId === null) {
      if (!t.transfer) return;
      Reflect.deleteProperty(t, 'transfer');
      if (peer && removeTransaction(draft, peer.id)) tombstone(draft, peer.id, ctx.now);
    } else if (peer) {
      required(draft.accounts[accountId], 'Account');
      if (accountId === t.accountId)
        throw new CommandError('A transfer needs two different accounts.');
      peer.accountId = accountId;
      peer.updatedAt = ctx.now;
    } else {
      createPeer(draft, t, accountId, ctx);
    }
    t.updatedAt = ctx.now;
  },
});

export interface SplitInput {
  id?: Id;
  amount: Cents;
  categoryId?: Id | undefined;
  tags?: Id[] | undefined;
  excluded?: boolean | undefined;
  note?: string | undefined;
}

/**
 * Replaces a transaction's splits. Two or more splits must add up to the transaction's
 * amount; a single entry turns it back into an ordinary (unsplit) transaction.
 */
export const setSplits = defineCommand<{ id: Id; splits: readonly SplitInput[] }>({
  label: 'Split transaction',
  run(draft, { id, splits }, { now, newId }) {
    const t = required(getTransaction(draft, id), 'Transaction');
    if (t.transfer) throw new CommandError('Transfers can’t be split.');
    if (splits.length === 0) throw new CommandError('A transaction needs at least one split.');
    for (const s of splits) validateRefs(draft, s);

    if (splits.length === 1) {
      const only = splits[0] as SplitInput;
      Reflect.deleteProperty(t, 'splits');
      applyChanges(t, { categoryId: only.categoryId });
      t.updatedAt = now;
      return;
    }
    const sum = splits.reduce((total, s) => total + s.amount, 0);
    if (sum !== t.amount) {
      throw new CommandError('Splits must add up to the transaction amount.');
    }
    t.splits = splits.map((s) => {
      const split: Split = { id: s.id ?? newId('split'), amount: s.amount };
      applyChanges(split, {
        categoryId: s.categoryId,
        tags: s.tags,
        excluded: s.excluded ? true : undefined,
        note: s.note?.trim() || undefined,
      });
      return split;
    });
    Reflect.deleteProperty(t, 'categoryId');
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

/** Copy of `t` with fresh ids on `date`, minus statement/reconcile state and transfer link. */
function copyOf(t: Transaction, date: ISODate, ctx: CommandContext): Transaction {
  const copy: Transaction = {
    ...t,
    id: ctx.newId('transaction'),
    date,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  if (t.splits) {
    copy.splits = t.splits.map((s) => ({
      ...s,
      id: ctx.newId('split'),
      ...(s.tags && { tags: [...s.tags] }),
    }));
  }
  if (t.tags) copy.tags = [...t.tags];
  for (const key of ['reconciled', 'statementId', 'transfer'] as const) {
    Reflect.deleteProperty(copy, key);
  }
  return copy;
}

/**
 * Copies transactions to a new date (category, splits, tags, note and exclusion included;
 * reconciliation isn't). A transfer is copied as a new linked pair, once even if both
 * sides are given. Returns the new ids, in the order given.
 */
export const copyTransactions = defineCommand<{ ids: readonly Id[]; date: ISODate }, Id[]>({
  label: 'Copy transactions',
  run(draft, { ids, date }, ctx) {
    const copied = new Set<Id>();
    const out: Id[] = [];
    for (const id of ids) {
      if (copied.has(id)) continue;
      const t = required<Transaction>(getTransaction(draft, id), 'Transaction');
      const copy = copyOf(t, date, ctx);
      copied.add(id);
      const peer = t.transfer ? getTransaction(draft, t.transfer.peerId) : undefined;
      if (peer) {
        const peerCopy = copyOf(peer, date, ctx);
        copy.transfer = { peerId: peerCopy.id };
        peerCopy.transfer = { peerId: copy.id };
        putTransaction(draft, peerCopy);
        copied.add(peer.id);
      }
      putTransaction(draft, copy);
      out.push(copy.id);
    }
    return out;
  },
});

export interface TransactionForm {
  /** Existing transaction to update; omit to create a new one. */
  id?: Id;
  accountId: Id;
  date: ISODate;
  payee: string;
  amount: Cents;
  /** Category (ignored for split transactions). Mutually exclusive with `transferAccountId`. */
  categoryId: Id | null;
  /** Other account of a transfer, or null for a regular transaction. */
  transferAccountId: Id | null;
  /** Tag names; tags that don't exist yet are created. */
  tagNames: readonly string[];
  note: string;
}

/**
 * Saves everything an editor form produces (fields, category or transfer, new tags) as
 * one undoable step. Returns the transaction id.
 */
export const saveTransaction = defineCommand<TransactionForm, Id>({
  label: 'Save transaction',
  run(draft, form, ctx) {
    if (form.categoryId !== null && form.transferAccountId !== null) {
      throw new CommandError('A transaction is either categorized or a transfer, not both.');
    }
    const byName = new Map(Object.values(draft.tags).map((t) => [t.name.toLowerCase(), t.id]));
    const tagIds: Id[] = [];
    for (const raw of form.tagNames) {
      const name = raw.trim();
      if (!name) continue;
      let id = byName.get(name.toLowerCase());
      if (!id) {
        id = ctx.newId('tag');
        draft.tags[id] = { id, name, updatedAt: ctx.now };
        byName.set(name.toLowerCase(), id);
      }
      if (!tagIds.includes(id)) tagIds.push(id);
    }

    let t: Draft<Transaction>;
    if (form.id === undefined) {
      validateRefs(
        draft,
        form.categoryId !== null
          ? { accountId: form.accountId, categoryId: form.categoryId }
          : { accountId: form.accountId },
      );
      const created: Transaction = {
        id: ctx.newId('transaction'),
        accountId: form.accountId,
        date: form.date,
        payee: form.payee.trim(),
        amount: form.amount,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      };
      applyChanges(created, {
        categoryId: form.categoryId ?? undefined,
        tags: tagIds,
        note: form.note.trim() || undefined,
      });
      putTransaction(draft, created);
      t = required(getTransaction(draft, created.id), 'Transaction');
    } else {
      t = required(getTransaction(draft, form.id), 'Transaction');
      // Leaving or changing a transfer first, so the field updates below apply cleanly.
      if (t.transfer && form.transferAccountId === null) {
        const peerId = t.transfer.peerId;
        Reflect.deleteProperty(t, 'transfer');
        if (removeTransaction(draft, peerId)) tombstone(draft, peerId, ctx.now);
      }
      applyTransactionChanges(
        draft,
        t,
        {
          accountId: form.accountId,
          date: form.date,
          payee: form.payee,
          ...(t.splits ? {} : { amount: form.amount }),
          ...(t.splits || t.transfer || form.transferAccountId !== null
            ? {}
            : { categoryId: form.categoryId ?? undefined }),
          tags: tagIds,
          note: form.note,
        },
        ctx.now,
      );
    }

    if (form.transferAccountId !== null) {
      const peer = t.transfer ? getTransaction(draft, t.transfer.peerId) : undefined;
      if (peer) {
        if (form.transferAccountId === t.accountId)
          throw new CommandError('A transfer needs two different accounts.');
        required(draft.accounts[form.transferAccountId], 'Account');
        peer.accountId = form.transferAccountId;
        peer.amount = -t.amount;
        peer.updatedAt = ctx.now;
      } else {
        createPeer(draft, t, form.transferAccountId, ctx);
      }
    }
    return t.id;
  },
});

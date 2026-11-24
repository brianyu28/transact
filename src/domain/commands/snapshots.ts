import type { BalanceSnapshot, Cents, ISODate, Id } from '../schema/types';
import { applyChanges, defineCommand, required, tombstone } from './define';

/** Records "at the start of `date`, this account's balance is `balance`". */
export const createSnapshot = defineCommand<
  {
    accountId: Id;
    date: ISODate;
    balance: Cents;
    note?: string;
    source?: BalanceSnapshot['source'];
  },
  Id
>({
  label: 'Update balance',
  run(draft, { accountId, date, balance, note, source }, { now, newId }) {
    required(draft.accounts[accountId], 'Account');
    // One snapshot per account per date: replace an existing one.
    const existing = Object.values(draft.balanceSnapshots).find(
      (s) => s.accountId === accountId && s.date === date,
    );
    if (existing) {
      existing.balance = balance;
      applyChanges(existing, { note: note?.trim() || undefined });
      existing.updatedAt = now;
      return existing.id;
    }
    const snapshot: BalanceSnapshot = {
      id: newId('snapshot'),
      accountId,
      date,
      balance,
      source: source ?? 'manual',
      updatedAt: now,
    };
    applyChanges(snapshot, { note: note?.trim() || undefined });
    draft.balanceSnapshots[snapshot.id] = snapshot;
    return snapshot.id;
  },
});

export const updateSnapshot = defineCommand<{
  id: Id;
  changes: { date?: ISODate; balance?: Cents; note?: string };
}>({
  label: 'Edit balance',
  run(draft, { id, changes }, { now }) {
    const s = required(draft.balanceSnapshots[id], 'Balance');
    if (changes.date !== undefined) s.date = changes.date;
    if (changes.balance !== undefined) s.balance = changes.balance;
    if (changes.note !== undefined) applyChanges(s, { note: changes.note.trim() || undefined });
    s.updatedAt = now;
  },
});

export const deleteSnapshot = defineCommand<{ id: Id }>({
  label: 'Delete balance',
  run(draft, { id }, { now }) {
    required(draft.balanceSnapshots[id], 'Balance');
    Reflect.deleteProperty(draft.balanceSnapshots, id);
    tombstone(draft, id, now);
  },
});

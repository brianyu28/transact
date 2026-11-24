/** Statements and reconciliation. */
import { original } from 'immer';
import { addDays } from '@/lib/date';
import { getTransaction, iterateTransactions, putTransaction, type DocModel } from '../model';
import type { Cents, ISODate, Id, Statement, Transaction } from '../schema/types';
import { applyChanges, CommandError, defineCommand, required, tombstone } from './define';

export interface StatementInput {
  accountId: Id;
  startDate: ISODate;
  endDate: ISODate;
  openingBalance: Cents;
  closingBalance: Cents;
  note?: string;
}

function validate(input: Pick<StatementInput, 'startDate' | 'endDate'>) {
  if (input.endDate < input.startDate)
    throw new CommandError('The statement ends before it starts.');
}

export const createStatement = defineCommand<StatementInput, Id>({
  label: 'Add statement',
  run(draft, input, { now, newId }) {
    required(draft.accounts[input.accountId], 'Account');
    validate(input);
    const statement: Statement = {
      id: newId('statement'),
      accountId: input.accountId,
      startDate: input.startDate,
      endDate: input.endDate,
      openingBalance: input.openingBalance,
      closingBalance: input.closingBalance,
      status: 'open',
      updatedAt: now,
    };
    applyChanges(statement, { note: input.note?.trim() || undefined });
    draft.statements[statement.id] = statement;
    return statement.id;
  },
});

export const updateStatement = defineCommand<{
  id: Id;
  changes: Partial<
    Pick<StatementInput, 'startDate' | 'endDate' | 'openingBalance' | 'closingBalance' | 'note'>
  >;
}>({
  label: 'Edit statement',
  run(draft, { id, changes }, { now }) {
    const s = required(draft.statements[id], 'Statement');
    validate({
      startDate: changes.startDate ?? s.startDate,
      endDate: changes.endDate ?? s.endDate,
    });
    applyChanges(s, {
      ...(changes.startDate !== undefined ? { startDate: changes.startDate } : {}),
      ...(changes.endDate !== undefined ? { endDate: changes.endDate } : {}),
      ...(changes.openingBalance !== undefined ? { openingBalance: changes.openingBalance } : {}),
      ...(changes.closingBalance !== undefined ? { closingBalance: changes.closingBalance } : {}),
      ...(changes.note !== undefined ? { note: changes.note.trim() || undefined } : {}),
    });
    s.updatedAt = now;
  },
});

/** Checks transactions on (or off) a statement. Progress is saved as you go. */
export const setStatementMembership = defineCommand<{
  statementId: Id;
  ids: readonly Id[];
  member: boolean;
}>({
  label: 'Check off transactions',
  run(draft, { statementId, ids, member }, { now }) {
    const statement = required(draft.statements[statementId], 'Statement');
    for (const id of ids) {
      const t = required(getTransaction(draft, id), 'Transaction');
      if (t.accountId !== statement.accountId)
        throw new CommandError('That transaction is in a different account.');
      if (member) {
        if (t.statementId !== undefined && t.statementId !== statementId) {
          throw new CommandError('That transaction is already on another statement.');
        }
        t.statementId = statementId;
        if (statement.status === 'reconciled') t.reconciled = true;
      } else if (t.statementId === statementId) {
        Reflect.deleteProperty(t, 'statementId');
        Reflect.deleteProperty(t, 'reconciled');
      }
      t.updatedAt = now;
    }
  },
});

function membersOf(draft: DocModel, statementId: Id): Id[] {
  const ids: Id[] = [];
  for (const t of iterateTransactions(draft)) if (t.statementId === statementId) ids.push(t.id);
  return ids;
}

/**
 * Finishes a statement: its transactions become reconciled. Optionally records the
 * closing balance as a balance update at the start of the day after the statement ends.
 */
export const finishStatement = defineCommand<{ id: Id; recordBalance: boolean }>({
  label: 'Finish reconciling',
  run(draft, { id, recordBalance }, { now, newId }) {
    const statement = required(draft.statements[id], 'Statement');
    const base: DocModel = original(draft);
    for (const txnId of membersOf(base, id)) {
      const t = getTransaction(draft, txnId);
      if (t && !t.reconciled) {
        t.reconciled = true;
        t.updatedAt = now;
      }
    }
    statement.status = 'reconciled';
    statement.reconciledAt = now;
    statement.updatedAt = now;
    if (recordBalance) {
      const date = addDays(statement.endDate, 1);
      const existing = Object.values(draft.balanceSnapshots).find(
        (s) => s.accountId === statement.accountId && s.date === date,
      );
      if (existing) {
        existing.balance = statement.closingBalance;
        existing.source = 'statement';
        existing.updatedAt = now;
      } else {
        const snapshotId = newId('snapshot');
        draft.balanceSnapshots[snapshotId] = {
          id: snapshotId,
          accountId: statement.accountId,
          date,
          balance: statement.closingBalance,
          source: 'statement',
          updatedAt: now,
        };
      }
    }
  },
});

/** Reopens a finished statement so it can be changed; its transactions become unreconciled. */
export const reopenStatement = defineCommand<{ id: Id }>({
  label: 'Reopen statement',
  run(draft, { id }, { now }) {
    const statement = required(draft.statements[id], 'Statement');
    for (const txnId of membersOf(original(draft), id)) {
      const t = getTransaction(draft, txnId);
      if (t?.reconciled) {
        Reflect.deleteProperty(t, 'reconciled');
        t.updatedAt = now;
      }
    }
    statement.status = 'open';
    Reflect.deleteProperty(statement, 'reconciledAt');
    statement.updatedAt = now;
  },
});

/** Deletes a statement; its transactions go back to unreconciled and unassigned. */
export const deleteStatement = defineCommand<{ id: Id }>({
  label: 'Delete statement',
  run(draft, { id }, { now }) {
    required(draft.statements[id], 'Statement');
    for (const txnId of membersOf(original(draft), id)) {
      const t = getTransaction(draft, txnId);
      if (!t) continue;
      Reflect.deleteProperty(t, 'statementId');
      Reflect.deleteProperty(t, 'reconciled');
      t.updatedAt = now;
    }
    Reflect.deleteProperty(draft.statements, id);
    tombstone(draft, id, now);
  },
});

/**
 * Closes an unexplained gap: adds a "Reconciliation adjustment" transaction for the
 * difference (excluded from budgets) and checks it onto the statement.
 */
export const addReconcileAdjustment = defineCommand<{ statementId: Id; amount: Cents }, Id>({
  label: 'Add adjustment',
  run(draft, { statementId, amount }, { now, newId }) {
    const statement = required(draft.statements[statementId], 'Statement');
    if (amount === 0) throw new CommandError('There’s no difference to adjust.');
    const t: Transaction = {
      id: newId('transaction'),
      accountId: statement.accountId,
      date: statement.endDate,
      payee: 'Reconciliation adjustment',
      amount,
      excluded: true,
      statementId,
      note: 'Added while reconciling to match the statement balance.',
      createdAt: now,
      updatedAt: now,
    };
    if (statement.status === 'reconciled') t.reconciled = true;
    putTransaction(draft, t);
    return t.id;
  },
});

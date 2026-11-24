import { Button, Group, Modal, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { balanceAtStart, getLedger, isLiability } from '@/domain/aggregates/balances';
import type { Account } from '@/domain/schema/types';
import { useFormat } from '@/hooks/useFormat';
import { isISODate, today } from '@/lib/date';
import { parseMoney } from '@/lib/money';
import { tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { INVESTMENT_TYPES } from './accountGroups';
import styles from './UpdateBalanceDialog.module.scss';

interface UpdateBalanceDialogProps {
  account: Account | null;
  onClose: () => void;
}

/**
 * Records the account's real balance on a date. For liabilities the user enters the
 * amount owed (stored as a negative balance). Shows how it differs from what the
 * transactions imply, and what that difference will be recorded as.
 */
export function UpdateBalanceDialog({ account, onClose }: UpdateBalanceDialogProps) {
  return (
    <Modal
      opened={account !== null}
      onClose={onClose}
      title={account ? `Update balance · ${account.name}` : ''}
      size="sm"
    >
      {account && <UpdateBalanceForm account={account} onClose={onClose} />}
    </Modal>
  );
}

function UpdateBalanceForm({ account, onClose }: { account: Account; onClose: () => void }) {
  const index = useDocStore((s) => s.index);
  const snapshots = useDocStore((s) => s.doc?.balanceSnapshots);
  const format = useFormat();
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const liability = isLiability(account);

  const validDate = isISODate(date);
  const implied =
    index && snapshots && validDate
      ? balanceAtStart(getLedger({ balanceSnapshots: snapshots }, index, account.id), date)
      : null;
  const parsed = parseMoney(amount);
  const balance = parsed === null ? null : liability ? -Math.abs(parsed) : parsed;
  const difference = balance !== null && implied !== null ? balance - implied : null;
  const kind = INVESTMENT_TYPES.has(account.type) ? 'market change' : 'balance adjustment';

  const save = () => {
    if (balance === null || !validDate) return;
    if (tryRun('createSnapshot', { accountId: account.id, date, balance, note })) onClose();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <TextInput
        type="date"
        label="Balance at the start of"
        value={date}
        onChange={(e) => {
          setDate(e.currentTarget.value);
        }}
        mb="sm"
      />
      <TextInput
        data-autofocus
        label={liability ? 'Amount owed' : 'Balance'}
        inputMode="decimal"
        placeholder="0.00"
        value={amount}
        onChange={(e) => {
          setAmount(e.currentTarget.value);
        }}
        error={amount !== '' && parsed === null ? 'Enter an amount' : undefined}
        mb="sm"
      />
      <TextInput
        label="Note"
        placeholder="Optional"
        value={note}
        onChange={(e) => {
          setNote(e.currentTarget.value);
        }}
        mb="sm"
      />
      {implied !== null && (
        <dl className={styles.summary}>
          <dt>From transactions</dt>
          <dd>{format.money(implied)}</dd>
          {difference !== null && (
            <>
              <dt>Difference</dt>
              <dd
                className={difference === 0 ? undefined : difference > 0 ? styles.up : styles.down}
              >
                {difference === 0
                  ? 'None'
                  : `${format.money(difference, { sign: 'always' })} ${kind}`}
              </dd>
            </>
          )}
        </dl>
      )}
      <Text size="xs" c="dimmed" mb="sm">
        Balance updates don’t affect budgets. Later transactions continue from this balance.
      </Text>
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={balance === null || !validDate}>
          Save balance
        </Button>
      </Group>
    </form>
  );
}

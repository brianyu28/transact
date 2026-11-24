import { Button, Group, Modal, Select, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { MoneyInput } from '@/components/MoneyInput/MoneyInput';
import { isLiability } from '@/domain/aggregates/balances';
import { sortedAccounts } from '@/domain/aggregates/lookups';
import type { Id } from '@/domain/schema/types';
import { nextStatementDefaults } from '@/domain/statements/reconcile';
import { addMonths, endOfMonth, isISODate, startOfMonth, today } from '@/lib/date';
import { parseMoney } from '@/lib/money';
import { tryDispatch } from '@/store/actions';
import { docStore, useDocStore } from '@/store/docStore';

interface NewStatementDialogProps {
  opened: boolean;
  defaultAccountId: Id | null;
  onClose: () => void;
}

export function NewStatementDialog({ opened, defaultAccountId, onClose }: NewStatementDialogProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="New statement" size="sm">
      {opened && <NewStatementForm defaultAccountId={defaultAccountId} onClose={onClose} />}
    </Modal>
  );
}

function defaultsFor(accountId: Id | null): {
  startDate: string;
  openingBalance: number;
  fromPrevious: boolean;
} {
  const { doc, index } = docStore.getState();
  const fallbackStart = startOfMonth(addMonths(today(), -1));
  if (!doc || !index || !accountId)
    return { startDate: fallbackStart, openingBalance: 0, fromPrevious: false };
  const hasPrevious = Object.values(doc.statements).some((s) => s.accountId === accountId);
  return {
    ...nextStatementDefaults(doc, index, accountId, fallbackStart),
    fromPrevious: hasPrevious,
  };
}

function NewStatementForm({
  defaultAccountId,
  onClose,
}: {
  defaultAccountId: Id | null;
  onClose: () => void;
}) {
  const accounts = useDocStore((s) => s.doc?.accounts);
  const [, navigate] = useLocation();
  const list = accounts ? sortedAccounts({ accounts }).filter((a) => !a.closed) : [];
  const initialAccount =
    defaultAccountId ?? list.find((a) => a.type === 'credit')?.id ?? list[0]?.id ?? null;
  const [accountId, setAccountId] = useState<Id | null>(initialAccount);
  const [start, setStart] = useState(() => defaultsFor(initialAccount).startDate);
  const [end, setEnd] = useState(() => endOfMonth(defaultsFor(initialAccount).startDate));
  const [opening, setOpening] = useState(() => defaultsFor(initialAccount).openingBalance);
  const [fromPrevious, setFromPrevious] = useState(() => defaultsFor(initialAccount).fromPrevious);
  const [closing, setClosing] = useState('');
  const account = accountId ? accounts?.[accountId] : undefined;
  const liability = account ? isLiability(account) : false;
  const closingCents = parseMoney(closing);

  const chooseAccount = (id: Id | null) => {
    setAccountId(id);
    const d = defaultsFor(id);
    setStart(d.startDate);
    setEnd(endOfMonth(d.startDate));
    setOpening(d.openingBalance);
    setFromPrevious(d.fromPrevious);
  };

  const create = () => {
    if (!accountId || closingCents === null || !isISODate(start) || !isISODate(end)) return;
    const id = tryDispatch('createStatement', {
      accountId,
      startDate: start,
      endDate: end,
      openingBalance: opening,
      closingBalance: liability ? -Math.abs(closingCents) : closingCents,
    });
    if (id) {
      onClose();
      navigate(`/statements/${id}`);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <Select
        label="Account"
        data={list.map((a) => ({ value: a.id, label: a.name }))}
        value={accountId}
        onChange={chooseAccount}
        allowDeselect={false}
        searchable
        mb="sm"
      />
      <Group grow mb="sm">
        <TextInput
          type="date"
          label="Period start"
          value={start}
          onChange={(e) => {
            setStart(e.currentTarget.value);
          }}
        />
        <TextInput
          type="date"
          label="Period end"
          value={end}
          onChange={(e) => {
            setEnd(e.currentTarget.value);
          }}
        />
      </Group>
      <Group grow mb="sm" align="flex-start">
        <MoneyInput
          label="Opening balance"
          description={
            fromPrevious ? 'From the previous statement' : 'Calculated from your transactions'
          }
          value={opening}
          onCommit={setOpening}
        />
        <TextInput
          data-autofocus
          label={liability ? 'Statement balance owed' : 'Closing balance'}
          description={
            liability ? 'As printed on the statement' : 'Ending balance on the statement'
          }
          inputMode="decimal"
          placeholder="0.00"
          value={closing}
          error={closing !== '' && closingCents === null ? 'Enter an amount' : undefined}
          onChange={(e) => {
            setClosing(e.currentTarget.value);
          }}
        />
      </Group>
      {liability && (
        <Text size="xs" c="dimmed" mb="sm">
          Card and loan balances are stored as negative numbers (money owed).
        </Text>
      )}
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!accountId || closingCents === null}>
          Start reconciling
        </Button>
      </Group>
    </form>
  );
}

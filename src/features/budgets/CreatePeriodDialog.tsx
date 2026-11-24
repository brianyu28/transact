import { Button, Group, Modal, Text } from '@mantine/core';
import { clsx } from 'clsx';
import { useState } from 'react';
import { MoneyInput } from '@/components/MoneyInput/MoneyInput';
import type { PeriodKey } from '@/domain/budgets/periods';
import type { RolloverRow } from '@/domain/budgets/views';
import type { BudgetTier, Cents, Id } from '@/domain/schema/types';
import { useFormat } from '@/hooks/useFormat';
import { tryRun } from '@/store/actions';
import { useRolloverSuggestions } from './useBudgetData';
import styles from './CreatePeriodDialog.module.scss';

interface CreatePeriodDialogProps {
  cadence: BudgetTier;
  /** Period to create, or null when closed. */
  periodKey: PeriodKey | null;
  label: string;
  onClose: () => void;
}

/**
 * Creates a month or year budget: starts from the defaults, shows what was left over
 * (or overspent) last period, and lets you choose how much of it to roll over.
 */
export function CreatePeriodDialog({
  cadence,
  periodKey,
  label,
  onClose,
}: CreatePeriodDialogProps) {
  const rows = useRolloverSuggestions(cadence, periodKey);
  return (
    <Modal opened={periodKey !== null} onClose={onClose} title={`Create ${label} budget`} size="xl">
      {periodKey !== null && (
        <CreatePeriodForm
          key={periodKey}
          cadence={cadence}
          periodKey={periodKey}
          rows={rows}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function CreatePeriodForm({
  cadence,
  periodKey,
  rows,
  onClose,
}: {
  cadence: BudgetTier;
  periodKey: PeriodKey;
  rows: RolloverRow[];
  onClose: () => void;
}) {
  const format = useFormat();
  const [amounts, setAmounts] = useState<Record<Id, { base: Cents; rollover: Cents }>>(() =>
    Object.fromEntries(
      rows.map((r) => [r.templateLineId, { base: r.defaultAmount, rollover: r.suggested }]),
    ),
  );
  const set = (id: Id, patch: Partial<{ base: Cents; rollover: Cents }>) => {
    setAmounts((a) => ({ ...a, [id]: { base: 0, rollover: 0, ...a[id], ...patch } }));
  };
  const rollAll = (fn: (r: RolloverRow) => Cents) => {
    setAmounts((a) =>
      Object.fromEntries(
        rows.map((r) => [
          r.templateLineId,
          { base: a[r.templateLineId]?.base ?? r.defaultAmount, rollover: fn(r) },
        ]),
      ),
    );
  };

  const total = rows.reduce(
    (s, r) =>
      s + (amounts[r.templateLineId]?.base ?? 0) + (amounts[r.templateLineId]?.rollover ?? 0),
    0,
  );
  const hasPrevious = rows.some((r) => r.previousRemaining !== null);

  const create = () => {
    const lines = rows.map((r) => ({
      templateLineId: r.templateLineId,
      base: amounts[r.templateLineId]?.base ?? r.defaultAmount,
      rollover: amounts[r.templateLineId]?.rollover ?? 0,
    }));
    if (tryRun('createPeriod', { cadence, period: periodKey, lines })) onClose();
  };

  if (rows.length === 0) {
    return (
      <Text size="sm">
        There are no {cadence} lines in your defaults yet. Add some under Budgets → Defaults first.
      </Text>
    );
  }

  return (
    <>
      <Text size="sm" c="dimmed" mb="sm">
        Amounts start from your defaults.{' '}
        {hasPrevious
          ? 'Choose how much of last period’s leftover (or overspending) to carry over.'
          : 'Last period wasn’t created, so there’s nothing to roll over.'}
      </Text>
      <div className={styles.table} role="table">
        <div className={clsx(styles.row, styles.head)} role="row">
          <span>Line</span>
          <span className={styles.num}>Default</span>
          <span className={styles.num}>Left last period</span>
          <span className={styles.num}>Roll over</span>
          <span className={styles.num}>Budget</span>
        </div>
        {rows.map((r) => {
          const a = amounts[r.templateLineId] ?? { base: r.defaultAmount, rollover: 0 };
          return (
            <div key={r.templateLineId} className={styles.row} role="row">
              <span className={styles.label}>
                {r.label}
                {r.policy !== 'prompt' && (
                  <span className={styles.policy}>
                    {r.policy === 'full' ? 'always rolls over' : 'never rolls over'}
                  </span>
                )}
              </span>
              <MoneyInput
                size="xs"
                aria-label={`Amount for ${r.label}`}
                value={a.base}
                onCommit={(base) => {
                  set(r.templateLineId, { base });
                }}
              />
              <span
                className={clsx(
                  styles.num,
                  r.previousRemaining !== null && r.previousRemaining < 0
                    ? styles.negative
                    : styles.dim,
                )}
              >
                {r.previousRemaining === null ? '—' : format.money(r.previousRemaining)}
              </span>
              <MoneyInput
                size="xs"
                aria-label={`Rollover for ${r.label}`}
                value={a.rollover}
                disabled={r.previousRemaining === null}
                onCommit={(rollover) => {
                  set(r.templateLineId, { rollover });
                }}
              />
              <span className={clsx(styles.num, styles.strong)}>
                {format.money(a.base + a.rollover)}
              </span>
            </div>
          );
        })}
        <div className={clsx(styles.row, styles.totalRow)} role="row">
          <span>Total</span>
          <span />
          <span />
          <span />
          <span className={clsx(styles.num, styles.strong)}>{format.money(total)}</span>
        </div>
      </div>
      <Group justify="space-between" mt="md">
        <Group gap="xs">
          {hasPrevious && (
            <>
              <Button
                size="xs"
                variant="subtle"
                onClick={() => {
                  rollAll((r) => r.previousRemaining ?? 0);
                }}
              >
                Roll over everything
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => {
                  rollAll(() => 0);
                }}
              >
                Roll over nothing
              </Button>
            </>
          )}
        </Group>
        <Group gap="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create}>Create budget</Button>
        </Group>
      </Group>
    </>
  );
}

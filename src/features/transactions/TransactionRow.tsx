import { Checkbox, Tooltip } from '@mantine/core';
import { IconCircleCheckFilled, IconCircleDashed, IconEyeOff, IconNote } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { memo, type MouseEvent } from 'react';
import type { Transaction } from '@/domain/schema/types';
import type { RowLabels } from './rowLabels';
import styles from './TransactionGrid.module.scss';

interface TransactionRowProps {
  t: Transaction;
  labels: RowLabels;
  date: string;
  amount: string;
  /** Running balance (shown instead of the account when filtered to one account). */
  balance?: string | undefined;
  active: boolean;
  selected: boolean;
  phone: boolean;
  onRowClick: (t: Transaction, e: MouseEvent) => void;
  onRowDoubleClick: (t: Transaction) => void;
  onToggleSelect: (t: Transaction) => void;
  onToggleReconciled: (t: Transaction) => void;
}

/** One register row. Memoized: only re-renders when its transaction or state changes. */
export const TransactionRow = memo(function TransactionRow({
  t,
  labels,
  date,
  amount,
  balance,
  active,
  selected,
  phone,
  onRowClick,
  onRowDoubleClick,
  onToggleSelect,
  onToggleReconciled,
}: TransactionRowProps) {
  const excluded = t.excluded === true;
  const amountClass = clsx(
    styles.amount,
    t.transfer ? styles.transferAmount : t.amount > 0 && styles.positive,
  );

  if (phone) {
    return (
      <div
        className={clsx(styles.card, active && styles.active)}
        onClick={(e) => {
          onRowClick(t, e);
        }}
        role="row"
        aria-selected={selected}
      >
        <div className={styles.cardLine}>
          <span className={styles.payee}>
            {t.payee || <span className={styles.dim}>(no payee)</span>}
          </span>
          <span className={amountClass}>{amount}</span>
        </div>
        <div className={clsx(styles.cardLine, styles.cardMeta)}>
          <span className={styles.truncate}>
            {date} · <span className={styles[labels.categoryKind]}>{labels.category}</span>
          </span>
          <span className={styles.truncate}>{labels.account}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        styles.row,
        active && styles.active,
        selected && styles.selected,
        excluded && styles.excludedRow,
      )}
      onClick={(e) => {
        onRowClick(t, e);
      }}
      onDoubleClick={() => {
        onRowDoubleClick(t);
      }}
      role="row"
      aria-selected={selected}
    >
      <span className={styles.cell} role="gridcell">
        <Checkbox
          size="xs"
          checked={selected}
          aria-label="Select"
          onClick={(e) => {
            e.stopPropagation();
          }}
          onChange={() => {
            onToggleSelect(t);
          }}
        />
      </span>
      <span className={clsx(styles.cell, styles.date)} role="gridcell">
        {date}
      </span>
      <span className={clsx(styles.cell, amountClass)} role="gridcell">
        {amount}
      </span>
      <span className={clsx(styles.cell, styles.truncate, styles.payee)} role="gridcell">
        {t.payee}
      </span>
      {balance !== undefined ? (
        <span className={clsx(styles.cell, styles.amount, styles.dim)} role="gridcell">
          {balance}
        </span>
      ) : (
        <span className={clsx(styles.cell, styles.truncate, styles.dim)} role="gridcell">
          {labels.account}
        </span>
      )}
      <span
        className={clsx(styles.cell, styles.truncate, styles[labels.categoryKind])}
        role="gridcell"
      >
        {labels.category}
      </span>
      <span className={clsx(styles.cell, styles.tags)} role="gridcell">
        {labels.tags.map((name) => (
          <span key={name} className={styles.tag}>
            {name}
          </span>
        ))}
      </span>
      <span className={clsx(styles.cell, styles.flags)} role="gridcell">
        {t.note && (
          <Tooltip label={t.note} multiline maw={320}>
            <IconNote size={14} className={styles.flagIcon} aria-label="Has note" />
          </Tooltip>
        )}
        {excluded && (
          <Tooltip label="Excluded from budgets">
            <IconEyeOff size={14} className={styles.flagIcon} aria-label="Excluded" />
          </Tooltip>
        )}
        <button
          type="button"
          className={clsx(styles.reconcile, t.reconciled && styles.reconciled)}
          onClick={(e) => {
            e.stopPropagation();
            onToggleReconciled(t);
          }}
          aria-label={
            t.reconciled ? 'Reconciled (click to unmark)' : 'Not reconciled (click to mark)'
          }
          title={t.reconciled ? 'Reconciled' : 'Not reconciled'}
        >
          {t.reconciled ? <IconCircleCheckFilled size={14} /> : <IconCircleDashed size={14} />}
        </button>
      </span>
    </div>
  );
});

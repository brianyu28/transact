import { IconScale } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { memo } from 'react';
import type { Anchor } from '@/domain/aggregates/balances';
import styles from './TransactionGrid.module.scss';

interface SnapshotRowProps {
  anchor: Anchor;
  date: string;
  adjustment: string;
  balance: string;
  active: boolean;
  onClick: () => void;
}

/** A balance update shown inline in a single-account register. */
export const SnapshotRow = memo(function SnapshotRow({
  anchor,
  date,
  adjustment,
  balance,
  active,
  onClick,
}: SnapshotRowProps) {
  const { snapshot } = anchor;
  return (
    <div
      className={clsx(styles.row, styles.snapshotRow, active && styles.active)}
      role="row"
      onClick={onClick}
    >
      <span className={styles.cell} role="gridcell">
        <IconScale size={14} className={styles.flagIcon} aria-hidden />
      </span>
      <span className={clsx(styles.cell, styles.date)} role="gridcell">
        {date}
      </span>
      <span
        className={clsx(styles.cell, styles.amount, styles.transferAmount)}
        role="gridcell"
        title="Difference from the transactions"
      >
        {anchor.adjustment === 0 ? '' : adjustment}
      </span>
      <span className={clsx(styles.cell, styles.truncate, styles.snapshotLabel)} role="gridcell">
        {snapshot.source === 'statement' ? 'Statement balance' : 'Balance update'}
      </span>
      <span className={clsx(styles.cell, styles.amount)} role="gridcell">
        {balance}
      </span>
      <span className={clsx(styles.cell, styles.truncate, styles.dim)} role="gridcell">
        {snapshot.note ?? ''}
      </span>
      <span className={styles.cell} role="gridcell" />
      <span className={styles.cell} role="gridcell" />
    </div>
  );
});

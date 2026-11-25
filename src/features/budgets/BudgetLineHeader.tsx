import { clsx } from 'clsx';
import styles from './BudgetLineRow.module.scss';

/** Column headings for a list of BudgetLineRows (hidden on phones, where rows stack). */
export function BudgetLineHeader({
  amount,
  extra,
  sortable = false,
  extraIsAmount = false,
}: {
  amount: string;
  extra: string;
  /** The extra column holds amounts (right-aligned). */
  extraIsAmount?: boolean;
  /** Rows have drag handles. */
  sortable?: boolean;
}) {
  return (
    <div className={clsx(styles.row, styles.head, !sortable && styles.noHandle)}>
      {sortable && <span />}
      <span>Categories</span>
      <span>Name (optional)</span>
      <span className={styles.num}>{amount}</span>
      <span className={clsx(extraIsAmount && styles.num)}>{extra}</span>
      <span />
    </div>
  );
}

import { clsx } from 'clsx';
import type { Cents } from '@/lib/money';
import { budgetStatus } from './budgetStatus';
import styles from './BudgetBar.module.scss';

interface BudgetBarProps {
  budgeted: Cents;
  spent: Cents;
  /** Fraction of the period elapsed (draws the pace marker); omit to hide it. */
  elapsed?: number | undefined;
}

/**
 * Spent vs. budgeted. The marker shows how much of the period has passed, so a fill past
 * the marker means spending is ahead of pace. Status is also given in text elsewhere
 * (never color alone).
 */
export function BudgetBar({ budgeted, spent, elapsed }: BudgetBarProps) {
  const ratio = budgeted > 0 ? Math.min(spent / budgeted, 1) : spent > 0 ? 1 : 0;
  const status = budgetStatus(budgeted, spent, elapsed ?? 1);
  return (
    <span className={styles.track} aria-hidden>
      <span
        className={clsx(styles.fill, styles[status])}
        style={{ width: `${Math.max(0, ratio) * 100}%` }}
      />
      {elapsed !== undefined && elapsed > 0 && elapsed < 1 && (
        <span className={styles.pace} style={{ left: `${elapsed * 100}%` }} />
      )}
    </span>
  );
}

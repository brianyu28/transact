import { Tooltip } from '@mantine/core';
import { IconListDetails } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { summarizePlan } from '@/domain/budgets/plan';
import type { LineView } from '@/domain/budgets/views';
import { useFormat } from '@/hooks/useFormat';
import { usePlanStatusText } from './usePlanStatusText';
import styles from './PlanBadge.module.scss';

/** A read-only plan indicator for a budget line: red when the budget falls short. */
export function PlanBadge({ line }: { line: Pick<LineView, 'base' | 'plan'> }) {
  const format = useFormat();
  const statusText = usePlanStatusText();
  if (!line.plan?.length) return null;
  const summary = summarizePlan(line.base, line.plan);
  return (
    <Tooltip
      label={
        <>
          {line.plan.map((item, i) => (
            <div key={i} className={styles.item}>
              <span>{item.label || 'Untitled'}</span>
              <span>{format.money(item.amount)}</span>
            </div>
          ))}
          <div className={clsx(styles.item, styles.result)}>
            <span>Planned {format.money(summary.planned)}</span>
            <span>{statusText(summary)}</span>
          </div>
        </>
      }
      openDelay={200}
    >
      <IconListDetails
        size={14}
        aria-label={`Plan: ${statusText(summary)}`}
        className={clsx(styles.icon, summary.status === 'short' && styles.short)}
      />
    </Tooltip>
  );
}

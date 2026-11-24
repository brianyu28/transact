import { Button } from '@mantine/core';
import {
  IconCategory,
  IconCircleCheck,
  IconEyeOff,
  IconTags,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { getTransaction } from '@/domain/model';
import type { Id } from '@/domain/schema/types';
import { useFormat } from '@/hooks/useFormat';
import { pluralize } from '@/lib/format';
import { useDocStore } from '@/store/docStore';
import { bulkActions } from './bulkActions';
import { registerActions, registerStore, useRegister } from './registerStore';
import styles from './StatusBar.module.scss';

/**
 * Bottom bar of the register. Shows the count and net total of what's listed; while rows
 * are selected it shows the selection and its actions instead. It never changes height,
 * so selecting rows doesn't move the list.
 */
export function StatusBar({ ids }: { ids: readonly Id[] }) {
  const selected = useRegister((s) => s.selected);
  const doc = useDocStore((s) => s.doc);
  const format = useFormat();
  if (!doc) return null;

  const sum = (list: Iterable<Id>) => {
    let total = 0;
    for (const id of list) total += getTransaction(doc, id)?.amount ?? 0;
    return total;
  };

  if (selected.size === 0) {
    return (
      <div className={styles.root}>
        <span>{pluralize(ids.length, 'transaction')}</span>
        <span className={styles.total}>Net {format.money(sum(ids))}</span>
      </div>
    );
  }

  const list = [...selected];
  const action = (label: string, icon: ReactNode, run: () => void, color?: string) => (
    <Button
      size="compact-xs"
      variant="subtle"
      color={color ?? 'accent'}
      leftSection={icon}
      onClick={run}
    >
      {label}
    </Button>
  );

  return (
    <div
      className={`${styles.root} ${styles.selecting}`}
      role="toolbar"
      aria-label="Selected transactions"
    >
      <span className={styles.count}>
        {pluralize(selected.size, 'selected', 'selected')} ·{' '}
        <span className={styles.total}>{format.money(sum(list))}</span>
      </span>
      <span className={styles.actions}>
        {action('Category', <IconCategory size={14} />, () => {
          registerStore.setState({ dialog: { kind: 'category', ids: list } });
        })}
        {action('Tags', <IconTags size={14} />, () => {
          registerStore.setState({ dialog: { kind: 'tags', ids: list } });
        })}
        {action('Reconciled', <IconCircleCheck size={14} />, () => {
          bulkActions.toggleReconciled(list);
        })}
        {action('Exclude', <IconEyeOff size={14} />, () => {
          bulkActions.toggleExcluded(list);
        })}
        {action(
          'Delete',
          <IconTrash size={14} />,
          () => {
            bulkActions.delete(list);
          },
          'red',
        )}
        {action('Clear', <IconX size={14} />, registerActions.clearSelection, 'gray')}
      </span>
    </div>
  );
}

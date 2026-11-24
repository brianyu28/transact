import { ActionIcon, Button, Menu, Switch } from '@mantine/core';
import { IconArchive, IconDots, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import type { CustomBudgetView } from '@/domain/budgets/views';
import type { CustomBudget } from '@/domain/schema/types';
import { useFormat } from '@/hooks/useFormat';
import { periodElapsed } from '@/domain/budgets/periods';
import { today } from '@/lib/date';
import { toastWithUndo, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { BudgetBar } from './BudgetBar';
import { CustomBudgetDialog } from './CustomBudgetDialog';
import { useCustomBudgetViews } from './useBudgetData';
import styles from './CustomBudgets.module.scss';

/** Tag-based budgets (trips, gifts, projects) with their spending. */
export function CustomBudgets() {
  const views = useCustomBudgetViews();
  const [editing, setEditing] = useState<CustomBudget | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = views.filter((v) => v.budget.archived).length;
  const visible = views.filter((v) => showArchived || !v.budget.archived);

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <p className={styles.intro}>
          Custom budgets collect tagged spending, like a trip, separately from your monthly and
          annual budgets.
        </p>
        <div className={styles.actions}>
          {archivedCount > 0 && (
            <Switch
              size="xs"
              label={`Show archived (${archivedCount})`}
              checked={showArchived}
              onChange={(e) => {
                setShowArchived(e.currentTarget.checked);
              }}
            />
          )}
          <Button
            leftSection={<IconPlus size={14} />}
            onClick={() => {
              setEditing('new');
            }}
          >
            New custom budget
          </Button>
        </div>
      </div>
      {visible.length === 0 && <p className={styles.empty}>No custom budgets yet.</p>}
      {visible.map((v) => (
        <CustomBudgetCard
          key={v.budget.id}
          view={v}
          onEdit={() => {
            setEditing(v.budget);
          }}
        />
      ))}
      <CustomBudgetDialog
        editing={editing}
        onClose={() => {
          setEditing(null);
        }}
      />
    </div>
  );
}

function CustomBudgetCard({ view, onEdit }: { view: CustomBudgetView; onEdit: () => void }) {
  const format = useFormat();
  const tags = useDocStore((s) => s.doc?.tags);
  const { budget } = view;
  const ranged = budget.dateRange !== undefined;
  const elapsed = ranged ? periodElapsed(view.bounds, today()) : undefined;
  const remaining = view.total - view.spent;
  const tagNames = budget.match.tags.map((id) => tags?.[id]?.name ?? '?');

  return (
    <section className={clsx(styles.card, budget.archived && styles.archived)}>
      <header className={styles.cardHeader}>
        <div className={styles.titleBlock}>
          <h3 className={styles.title}>{budget.name}</h3>
          <span className={styles.meta}>
            {budget.match.mode === 'all' ? 'All of: ' : ''}
            {tagNames.map((t) => (
              <span key={t} className={styles.tag}>
                {t}
              </span>
            ))}
            {ranged && (
              <span>
                {budget.dateRange?.start ? format.date(budget.dateRange.start) : '…'} –{' '}
                {budget.dateRange?.end ? format.date(budget.dateRange.end) : '…'}
              </span>
            )}
          </span>
        </div>
        <div className={styles.figures}>
          <span className={styles.figure}>
            {format.money(view.spent)}{' '}
            <span className={styles.of}>of {format.money(view.total)}</span>
          </span>
          <span className={clsx(styles.remaining, remaining < 0 && styles.negative)}>
            {remaining < 0 ? `${format.money(-remaining)} over` : `${format.money(remaining)} left`}
          </span>
        </div>
        <Menu position="bottom-end">
          <Menu.Target>
            <ActionIcon color="gray" aria-label={`Actions for ${budget.name}`}>
              <IconDots size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconPencil size={14} />} onClick={onEdit}>
              Edit
            </Menu.Item>
            <Menu.Item
              leftSection={<IconArchive size={14} />}
              onClick={() =>
                tryRun('setCustomBudgetArchived', { id: budget.id, archived: !budget.archived })
              }
            >
              {budget.archived ? 'Unarchive' : 'Archive'}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => {
                if (tryRun('deleteCustomBudget', { id: budget.id }))
                  toastWithUndo(`Deleted ${budget.name}`);
              }}
            >
              Delete
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </header>
      <BudgetBar budgeted={view.total} spent={view.spent} elapsed={elapsed} />
      {view.lines.length > 1 && (
        <div className={styles.lines}>
          {view.lines.map((l) => (
            <div key={l.lineId ?? 'other'} className={styles.line}>
              <span className={styles.lineLabel}>{l.label}</span>
              <span className={styles.num}>{format.money(l.spent)}</span>
              <span className={clsx(styles.num, styles.dim)}>
                {l.amount === null ? 'not budgeted' : `of ${format.money(l.amount)}`}
              </span>
              <BudgetBar budgeted={l.amount ?? 0} spent={l.spent} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

import { Alert, Button, Group, Menu } from '@mantine/core';
import {
  IconCheck,
  IconDots,
  IconInfoCircle,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { periodKeyFor, shiftPeriod } from '@/domain/budgets/periods';
import type { BudgetTier } from '@/domain/schema/types';
import { useFormat } from '@/hooks/useFormat';
import { useCommandHandlers } from '@/keyboard/useCommandHandlers';
import { today } from '@/lib/date';
import { toastWithUndo, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { StatTile } from '@/components/StatTile/StatTile';
import { BudgetTable } from './BudgetTable';
import { CreatePeriodDialog } from './CreatePeriodDialog';
import { PeriodEditor } from './PeriodEditor';
import { PeriodNav } from './PeriodNav';
import { useBudgetView } from './useBudgetData';
import styles from './PeriodBudget.module.scss';

/** A month or year budget with navigation, totals and the create/rollover flow. */
export function PeriodBudget({ cadence }: { cadence: BudgetTier }) {
  const startMonth = useDocStore((s) => s.doc?.settings.budgetYearStartMonth ?? 1);
  const current = periodKeyFor(cadence, today(), startMonth);
  const [key, setKey] = useState(current);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const view = useBudgetView(cadence, key);
  const format = useFormat();

  useCommandHandlers({
    'budget.prev': {
      run: () => {
        setKey((k) => shiftPeriod(cadence, k, -1));
      },
    },
    'budget.next': {
      run: () => {
        setKey((k) => shiftPeriod(cadence, k, 1));
      },
    },
    'budget.current': {
      run: () => {
        setKey(current);
      },
    },
  });

  if (!view) return null;
  const period = view.period;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <PeriodNav
          label={view.label}
          onPrev={() => {
            setKey(shiftPeriod(cadence, key, -1));
          }}
          onNext={() => {
            setKey(shiftPeriod(cadence, key, 1));
          }}
          onToday={
            key === current
              ? undefined
              : () => {
                  setKey(current);
                }
          }
        />
        <Group gap="xs">
          {!period && (
            <Button
              leftSection={<IconPlus size={14} />}
              onClick={() => {
                setCreating(true);
              }}
            >
              Create {view.label} budget
            </Button>
          )}
          {period && (
            <Button
              variant={editing ? 'filled' : 'default'}
              leftSection={editing ? <IconCheck size={14} /> : <IconPencil size={14} />}
              onClick={() => {
                setEditing(!editing);
              }}
            >
              {editing ? 'Done' : 'Edit'}
            </Button>
          )}
          {period && (
            <Menu position="bottom-end">
              <Menu.Target>
                <Button variant="subtle" color="gray" px={6} aria-label="Budget actions">
                  <IconDots size={16} />
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => {
                    if (tryRun('deletePeriod', { id: period.id }))
                      toastWithUndo(`Deleted the ${view.label} budget`);
                  }}
                >
                  Delete this budget
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </div>

      {!period && view.lines.length > 0 && (
        <Alert
          variant="light"
          color="gray"
          icon={<IconInfoCircle size={16} />}
          className={styles.notice}
        >
          This budget hasn’t been created yet, so it shows your defaults. Create it to set this
          {cadence === 'monthly' ? ' month' : ' year'}’s amounts and roll over what’s left from last
          time.
        </Alert>
      )}

      <div className={styles.tiles}>
        <StatTile label="Budgeted" value={format.money(view.totals.budgeted)} />
        <StatTile label="Spent" value={format.money(view.totals.spent)} />
        <StatTile
          label={view.totals.remaining < 0 ? 'Over budget' : 'Remaining'}
          value={format.money(Math.abs(view.totals.remaining))}
        />
        <StatTile label="Income" value={format.money(view.income)} />
      </div>

      {period && editing ? (
        <PeriodEditor period={period} label={view.label} />
      ) : (
        <BudgetTable view={view} editable />
      )}

      <CreatePeriodDialog
        cadence={cadence}
        periodKey={creating ? key : null}
        label={view.label}
        onClose={() => {
          setCreating(false);
        }}
      />
    </div>
  );
}

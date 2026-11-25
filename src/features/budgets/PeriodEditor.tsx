import { Button, Menu } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { MoneyInput } from '@/components/MoneyInput/MoneyInput';
import type { CommandPayload } from '@/domain/commands';
import { lineLabel } from '@/domain/budgets/views';
import type { BudgetPeriod } from '@/domain/schema/types';
import { useFormat } from '@/hooks/useFormat';
import { toastWithUndo, tryDispatch, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { AddBudgetLine } from './AddBudgetLine';
import { BudgetLineHeader } from './BudgetLineHeader';
import { BudgetLineRow } from './BudgetLineRow';
import styles from './PeriodEditor.module.scss';

type LineChanges = CommandPayload<'setPeriodLine'>['changes'];

/**
 * Edits a created month or year budget: amounts, rollovers, categories, notes and plans,
 * plus adding and removing lines. Changes affect only this period, never the defaults.
 */
export function PeriodEditor({ period, label }: { period: BudgetPeriod; label: string }) {
  const doc = useDocStore((s) => s.doc);
  const format = useFormat();
  if (!doc) return null;
  const monthly = period.cadence === 'monthly';
  const inPeriod = new Set(period.lines.map((l) => l.templateLineId));
  const missingDefaults = Object.values(doc.budgets.template.lines)
    .filter((l) => l.cadence === period.cadence && !inPeriod.has(l.id))
    .sort((a, b) => a.order - b.order);
  const hasEverythingElse = period.lines.some((l) => l.target.kind === 'everythingElse');
  const budgeted = period.lines.reduce((s, l) => s + l.base + l.rollover, 0);

  const change = (templateLineId: string, changes: LineChanges) => {
    tryRun('setPeriodLine', { periodId: period.id, templateLineId, changes });
  };

  return (
    <div className={styles.root}>
      <p className={styles.intro}>
        Changes apply to {label} only. To change future budgets too, edit Defaults.
      </p>
      <BudgetLineHeader amount="Budgeted" extra="Rolled over" extraIsAmount />
      {period.lines.map((line) => {
        const name = lineLabel(doc, line);
        return (
          <BudgetLineRow
            key={line.templateLineId}
            label={name}
            target={line.target}
            name={line.name}
            amount={line.base}
            per={monthly ? 'this month' : 'this year'}
            note={line.note}
            plan={line.plan}
            onTarget={(categoryIds) => {
              change(line.templateLineId, { target: { kind: 'categories', categoryIds } });
            }}
            onName={(n) => {
              change(line.templateLineId, { name: n });
            }}
            onAmount={(base) => {
              change(line.templateLineId, { base });
            }}
            onNote={(note) => {
              change(line.templateLineId, { note });
            }}
            onPlan={(plan) => {
              change(line.templateLineId, { plan });
            }}
            onDelete={() => {
              if (
                tryRun('removePeriodLine', {
                  periodId: period.id,
                  templateLineId: line.templateLineId,
                })
              )
                toastWithUndo(`Removed ${name} from ${label}`);
            }}
            deleteLabel={`Remove from ${monthly ? 'this month' : 'this year'}`}
            extra={{
              label: 'Rolled over',
              summary:
                line.rollover !== 0
                  ? `${format.money(line.rollover, { sign: 'always' })} rolled over`
                  : undefined,
              control: (place) => (
                <MoneyInput
                  size="xs"
                  {...(place === 'row'
                    ? { variant: 'unstyled' }
                    : { label: 'Rolled over from last time', maw: 200 })}
                  aria-label={`Rollover for ${name}`}
                  value={line.rollover}
                  onCommit={(rollover) => {
                    change(line.templateLineId, { rollover });
                  }}
                />
              ),
            }}
          />
        );
      })}
      <AddBudgetLine
        kind={period.cadence}
        canAddEverythingElse={
          !hasEverythingElse && !missingDefaults.some((t) => t.target.kind === 'everythingElse')
        }
        onAdd={(target, base) =>
          tryDispatch('addPeriodLine', { periodId: period.id, target, base }) !== undefined
        }
      >
        {missingDefaults.length > 0 && (
          <Menu position="bottom-start">
            <Menu.Target>
              <Button size="xs" variant="subtle" rightSection={<IconChevronDown size={14} />}>
                Add from defaults
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {missingDefaults.map((t) => (
                <Menu.Item
                  key={t.id}
                  rightSection={
                    <span className={styles.menuAmount}>{format.money(t.defaultAmount)}</span>
                  }
                  onClick={() => {
                    change(t.id, {});
                  }}
                >
                  {lineLabel(doc, t)}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
      </AddBudgetLine>
      <p className={styles.total}>
        <span>Total budgeted, with rollovers</span>
        <strong>{format.money(budgeted)}</strong>
      </p>
    </div>
  );
}

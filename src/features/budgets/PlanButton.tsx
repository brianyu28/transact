import { ActionIcon, Button, Group, Modal, Tooltip } from '@mantine/core';
import { IconListDetails, IconPlus } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { SortableGroup, SortableProvider } from '@/components/Sortable/Sortable';
import { summarizePlan } from '@/domain/budgets/plan';
import type { PlanItem } from '@/domain/schema/types';
import { useFormat } from '@/hooks/useFormat';
import { centsToInput, parseMoney, type Cents } from '@/lib/money';
import styles from './PlanButton.module.scss';
import { PlanItemRow, type PlanItemDraft } from './PlanItemRow';
import { usePlanStatusText } from './usePlanStatusText';

interface PlanButtonProps {
  plan: readonly PlanItem[] | undefined;
  /** The line's budgeted amount, compared with the plan total. */
  budgeted: Cents;
  /** What the plan is for, e.g. "Insurance" (used in the title and labels). */
  subject: string;
  /** "per month", "this year"…, shown next to the budgeted amount. */
  per?: string;
  onSave: (plan: PlanItem[]) => void;
  /** Sets the line's budgeted amount (offered as "Budget the plan total"). */
  onSetBudget?: (cents: Cents) => void;
  /** Show a labeled button instead of a bare icon, e.g. in a sheet. */
  labeled?: boolean;
  /** Keep the icon visible without a plan (where there's no row hover, e.g. in a dialog). */
  alwaysShow?: boolean;
  className?: string;
}

let nextKey = 1;
const toDraft = (item: PlanItem): PlanItemDraft => ({
  key: nextKey++,
  label: item.label,
  amount: item.amount === 0 ? '' : centsToInput(item.amount),
});
const emptyDraft = (): PlanItemDraft => ({ key: nextKey++, label: '', amount: '' });

/**
 * A plan icon that opens an editor for the expected costs a budget line should cover. The
 * icon is red when the budget falls short of the plan. Like NoteButton, it shows only on row
 * hover/focus (always on touch) until the line has a plan.
 */
export function PlanButton({
  plan,
  budgeted,
  subject,
  per,
  onSave,
  onSetBudget,
  labeled,
  alwaysShow,
  className,
}: PlanButtonProps) {
  const format = useFormat();
  const statusText = usePlanStatusText();
  const [items, setItems] = useState<PlanItemDraft[] | null>(null);
  const [budget, setBudget] = useState(budgeted);
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const has = Boolean(plan?.length);
  const saved = has && plan ? summarizePlan(budgeted, plan) : null;

  const open = () => {
    setItems(plan?.length ? plan.map(toDraft) : [emptyDraft()]);
    setBudget(budgeted);
    setFocusKey(null);
  };
  const close = () => {
    setItems(null);
  };
  const update = (key: number, patch: Partial<PlanItemDraft>) => {
    setItems((list) => list?.map((i) => (i.key === key ? { ...i, ...patch } : i)) ?? null);
  };
  const reorder = (_group: string, keys: string[]) => {
    setItems((list) => {
      if (!list) return list;
      const byKey = new Map(list.map((i) => [String(i.key), i]));
      return keys.map((k) => byKey.get(k)).filter((i): i is PlanItemDraft => i !== undefined);
    });
  };
  const add = () => {
    const item = emptyDraft();
    setItems((list) => [...(list ?? []), item]);
    setFocusKey(item.key);
  };

  const parsed = (items ?? []).map((i) => ({
    label: i.label,
    amount: i.amount.trim() === '' ? 0 : parseMoney(i.amount),
  }));
  const valid = parsed.every((i) => i.amount !== null);
  const draftPlan = parsed.map((i) => ({ label: i.label, amount: i.amount ?? 0 }));
  const summary = summarizePlan(budget, draftPlan);

  const save = () => {
    if (!valid) return;
    onSave(draftPlan);
    if (budget !== budgeted) onSetBudget?.(budget);
    close();
  };

  return (
    <>
      {labeled ? (
        <Button
          size="xs"
          variant="default"
          leftSection={<IconListDetails size={14} />}
          className={clsx(saved?.status === 'short' && styles.shortButton, className)}
          onClick={open}
        >
          {saved ? `Plan · ${statusText(saved)}` : 'Add plan'}
        </Button>
      ) : (
        <Tooltip
          label={
            saved
              ? `Planned ${format.money(saved.planned)} · ${statusText(saved)}`
              : 'Plan what this line covers'
          }
          openDelay={300}
        >
          <ActionIcon
            size="sm"
            variant="subtle"
            color={saved?.status === 'short' ? 'red' : has ? 'accent' : 'gray'}
            aria-label={has ? `Plan for ${subject}` : `Add a plan for ${subject}`}
            className={clsx(styles.button, !has && !alwaysShow && styles.empty, className)}
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
          >
            <IconListDetails size={14} />
          </ActionIcon>
        </Tooltip>
      )}
      <Modal opened={items !== null} onClose={close} title={`Plan · ${subject}`} size="md">
        <p className={styles.intro}>
          List the costs this budget should cover. The plan doesn’t change the budgeted amount.
        </p>
        <div className={styles.items}>
          <SortableProvider onReorder={reorder}>
            <SortableGroup ids={(items ?? []).map((i) => String(i.key))}>
              {items?.map((item, index) => (
                <PlanItemRow
                  key={item.key}
                  item={item}
                  index={index}
                  autoFocus={item.key === focusKey}
                  dataAutofocus={index === 0 && focusKey === null}
                  onChange={(patch) => {
                    update(item.key, patch);
                  }}
                  onRemove={() => {
                    setItems((list) => list?.filter((i) => i.key !== item.key) ?? null);
                  }}
                  onEnter={() => {
                    if (index === items.length - 1) add();
                  }}
                />
              ))}
            </SortableGroup>
          </SortableProvider>
        </div>
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconPlus size={14} />}
          onClick={add}
          className={styles.add}
        >
          Add item
        </Button>

        <dl className={styles.summary}>
          <dt>Planned</dt>
          <dd>{format.money(summary.planned)}</dd>
          <dt>Budgeted{per ? ` ${per}` : ''}</dt>
          <dd>{format.money(budget)}</dd>
          <dt className={styles.result}>Difference</dt>
          <dd className={clsx(styles.result, styles[summary.status])}>{statusText(summary)}</dd>
        </dl>
        {onSetBudget && summary.status === 'short' && valid && (
          <Button
            size="xs"
            variant="light"
            onClick={() => {
              setBudget(summary.planned);
            }}
          >
            Budget the plan total ({format.money(summary.planned)})
          </Button>
        )}

        <Group justify="space-between" mt="md">
          {has ? (
            <Button
              variant="subtle"
              color="red"
              size="xs"
              onClick={() => {
                onSave([]);
                close();
              }}
            >
              Delete plan
            </Button>
          ) : (
            <span />
          )}
          <Group gap="xs">
            <Button variant="default" size="xs" onClick={close}>
              Cancel
            </Button>
            <Button size="xs" onClick={save} disabled={!valid}>
              Save
            </Button>
          </Group>
        </Group>
      </Modal>
    </>
  );
}

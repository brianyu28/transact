import { ActionIcon, TextInput } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { DragHandle } from '@/components/Sortable/Sortable';
import { useSortableItem } from '@/components/Sortable/useSortableItem';
import { parseMoney } from '@/lib/money';
import styles from './PlanItemRow.module.scss';

export const PLAN_ITEMS_GROUP = 'plan-items';

export interface PlanItemDraft {
  key: number;
  label: string;
  amount: string;
}

interface PlanItemRowProps {
  item: PlanItemDraft;
  index: number;
  autoFocus: boolean;
  /** Puts the modal's initial focus here. */
  dataAutofocus: boolean;
  onChange: (patch: Partial<PlanItemDraft>) => void;
  onRemove: () => void;
  /** Enter in the amount field (adds a row after the last one). */
  onEnter: () => void;
}

/** One editable, drag-reorderable row of a budget line plan. */
export function PlanItemRow({
  item,
  index,
  autoFocus,
  dataAutofocus,
  onChange,
  onRemove,
  onEnter,
}: PlanItemRowProps) {
  const { setNodeRef, style, isDragging, handle } = useSortableItem(
    String(item.key),
    PLAN_ITEMS_GROUP,
  );
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(styles.item, isDragging && styles.dragging)}
    >
      <DragHandle handle={handle} label={`Reorder plan item ${index + 1}`} />
      <TextInput
        size="xs"
        placeholder="What it’s for"
        aria-label={`Plan item ${index + 1} label`}
        maxLength={200}
        autoFocus={autoFocus}
        data-autofocus={dataAutofocus ? true : undefined}
        value={item.label}
        onChange={(e) => {
          onChange({ label: e.currentTarget.value });
        }}
        className={styles.label}
      />
      <TextInput
        size="xs"
        placeholder="0.00"
        aria-label={`Plan item ${index + 1} amount`}
        inputMode="decimal"
        value={item.amount}
        error={item.amount.trim() !== '' && parseMoney(item.amount) === null}
        onChange={(e) => {
          onChange({ amount: e.currentTarget.value });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter();
        }}
        classNames={{ input: styles.amountInput }}
        className={styles.amount}
      />
      <ActionIcon
        size="sm"
        variant="subtle"
        color="gray"
        aria-label={`Remove plan item ${index + 1}`}
        onClick={onRemove}
      >
        <IconX size={14} />
      </ActionIcon>
    </div>
  );
}

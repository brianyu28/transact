import { ActionIcon, Button, Modal, TextInput, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconChevronRight, IconListDetails, IconNote, IconTrash } from '@tabler/icons-react';
import { clsx } from 'clsx';
import type { CSSProperties, ReactNode, Ref } from 'react';
import { useState } from 'react';
import { CategoryMultiSelect } from '@/components/CategoryMultiSelect/CategoryMultiSelect';
import { MoneyInput } from '@/components/MoneyInput/MoneyInput';
import { NoteButton } from '@/components/NoteButton/NoteButton';
import { summarizePlan } from '@/domain/budgets/plan';
import type { BudgetTarget, Cents, Id, PlanItem } from '@/domain/schema/types';
import { EDITOR_SHEET_QUERY, PHONE_QUERY } from '@/features/transactions/media';
import { PlanButton } from './PlanButton';
import { usePlanStatusText } from './usePlanStatusText';
import styles from './BudgetLineRow.module.scss';

export interface BudgetLineRowProps {
  label: string;
  target: BudgetTarget;
  name: string | undefined;
  amount: Cents;
  /** "per month", "this year"…, shown in the plan editor. */
  per: string;
  note: string | undefined;
  plan: readonly PlanItem[] | undefined;
  onTarget: (categoryIds: Id[]) => void;
  onName: (name: string) => void;
  onAmount: (cents: Cents) => void;
  onNote: (note: string) => void;
  onPlan: (plan: PlanItem[]) => void;
  onDelete: () => void;
  deleteLabel: string;
  /** The extra column (rollover policy or amount). */
  extra: {
    label: string;
    /** Inline in the row (unstyled), or a labeled field in the sheet. */
    control: (place: 'row' | 'sheet') => ReactNode;
    /** Short text for the compact row, e.g. "Roll over: Ask". */
    summary?: string | undefined;
  };
  /** Drag handle, for reorderable lines. */
  handle?: ReactNode;
  rowRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  className?: string;
}

/**
 * One editable budget line. On desktop every field is inline; below that (as in the
 * register) the row shows the label, a one-line summary and the amount, and tapping it
 * opens a sheet with the rest.
 */
export function BudgetLineRow(props: BudgetLineRowProps) {
  const compact = useMediaQuery(EDITOR_SHEET_QUERY);
  return compact ? <CompactRow {...props} /> : <DesktopRow {...props} />;
}

function CategoriesField({
  target,
  onTarget,
  ...props
}: Pick<BudgetLineRowProps, 'target' | 'onTarget'> & {
  variant?: 'unstyled';
  label?: string;
}) {
  if (target.kind === 'everythingElse')
    return <span className={styles.everythingElse}>Everything Else</span>;
  return (
    <CategoryMultiSelect
      size="xs"
      expenseOnly
      aria-label="Categories"
      value={target.categoryIds}
      onChange={(ids) => {
        if (ids.length > 0) onTarget(ids);
      }}
      {...props}
    />
  );
}

function NameField({
  name,
  lineLabel: label,
  onName,
  ...props
}: Pick<BudgetLineRowProps, 'name' | 'onName'> & {
  lineLabel: string;
  variant?: 'unstyled';
  label?: string;
}) {
  return (
    <TextInput
      size="xs"
      {...props}
      aria-label="Line name"
      placeholder={label}
      defaultValue={name ?? ''}
      onBlur={(e) => {
        const next = e.currentTarget.value;
        if (next !== (name ?? '')) onName(next);
      }}
    />
  );
}

function DesktopRow(props: BudgetLineRowProps) {
  const { label, amount, extra, rowRef, style, className } = props;
  return (
    <div
      ref={rowRef}
      style={style}
      className={clsx(styles.row, 'tx-note-row', !props.handle && styles.noHandle, className)}
    >
      {props.handle}
      <CategoriesField target={props.target} onTarget={props.onTarget} variant="unstyled" />
      <NameField name={props.name} lineLabel={label} onName={props.onName} variant="unstyled" />
      <MoneyInput
        size="xs"
        variant="unstyled"
        aria-label={`Amount for ${label}`}
        value={amount}
        onCommit={props.onAmount}
      />
      <span className={styles.extra}>{extra.control('row')}</span>
      <span className={styles.actions}>
        <NoteButton note={props.note} subject={label} onSave={props.onNote} />
        <PlanButton
          plan={props.plan}
          budgeted={amount}
          subject={label}
          per={props.per}
          onSave={props.onPlan}
          onSetBudget={props.onAmount}
        />
        <Tooltip label={props.deleteLabel}>
          <ActionIcon
            size="sm"
            color="gray"
            aria-label={`${props.deleteLabel}: ${label}`}
            onClick={props.onDelete}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      </span>
    </div>
  );
}

function CompactRow(props: BudgetLineRowProps) {
  const { label, amount, extra, note, plan, rowRef, style, className } = props;
  const [open, setOpen] = useState(false);
  const phone = useMediaQuery(PHONE_QUERY);
  const statusText = usePlanStatusText();
  const summary = plan?.length ? summarizePlan(amount, plan) : null;
  const details = extra.summary ?? '';
  return (
    <div
      ref={rowRef}
      style={style}
      className={clsx(styles.compactRow, !props.handle && styles.noHandle, className)}
    >
      {props.handle}
      <button
        type="button"
        className={styles.main}
        aria-label={`Edit ${label}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        <span className={styles.mainLabel}>{label}</span>
        {(details || note || summary) && (
          <span className={styles.mainDetails}>
            {details}
            {note && <IconNote size={12} aria-label="Has a note" className={styles.noteIcon} />}
            {summary && (
              <span className={clsx(styles.planStatus, summary.status === 'short' && styles.short)}>
                <IconListDetails size={12} aria-hidden />
                {statusText(summary)}
              </span>
            )}
          </span>
        )}
      </button>
      <MoneyInput
        size="xs"
        variant="unstyled"
        aria-label={`Amount for ${label}`}
        value={amount}
        onCommit={props.onAmount}
      />
      <IconChevronRight size={16} className={styles.chevron} aria-hidden />

      <Modal
        opened={open}
        onClose={() => {
          setOpen(false);
        }}
        title={label}
        fullScreen={phone}
      >
        <div className={styles.sheet}>
          {props.target.kind === 'categories' && (
            <CategoriesField target={props.target} onTarget={props.onTarget} label="Categories" />
          )}
          <NameField
            name={props.name}
            lineLabel={label}
            onName={props.onName}
            label="Name (optional)"
          />
          <MoneyInput
            size="xs"
            label="Amount"
            value={amount}
            onCommit={props.onAmount}
            className={styles.sheetAmount}
          />
          {extra.control('sheet')}
          <div className={styles.sheetButtons}>
            <NoteButton note={note} subject={label} onSave={props.onNote} labeled />
            <PlanButton
              plan={plan}
              budgeted={amount}
              subject={label}
              per={props.per}
              onSave={props.onPlan}
              onSetBudget={props.onAmount}
              labeled
            />
          </div>
          <div className={styles.sheetFooter}>
            <Button
              variant="subtle"
              color="red"
              size="xs"
              leftSection={<IconTrash size={14} />}
              onClick={() => {
                setOpen(false);
                props.onDelete();
              }}
            >
              {props.deleteLabel}
            </Button>
            <Button
              size="xs"
              onClick={() => {
                setOpen(false);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

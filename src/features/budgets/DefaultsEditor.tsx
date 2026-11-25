import { Select } from '@mantine/core';
import { clsx } from 'clsx';
import { DragHandle, SortableGroup, SortableProvider } from '@/components/Sortable/Sortable';
import { useSortableItem } from '@/components/Sortable/useSortableItem';
import { lineLabel } from '@/domain/budgets/views';
import type { CommandPayload } from '@/domain/commands';
import type { BudgetTier, RolloverPolicy, TemplateLine } from '@/domain/schema/types';
import { useFormat } from '@/hooks/useFormat';
import { toastWithUndo, tryDispatch, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { AddBudgetLine } from './AddBudgetLine';
import { BudgetLineHeader } from './BudgetLineHeader';
import { BudgetLineRow } from './BudgetLineRow';
import styles from './DefaultsEditor.module.scss';

const POLICIES: { value: RolloverPolicy; label: string }[] = [
  { value: 'prompt', label: 'Ask' },
  { value: 'full', label: 'Always' },
  { value: 'none', label: 'Never' },
];

/** The default budget: the lines and amounts each new month/year starts from. */
export function DefaultsEditor() {
  const lines = useDocStore((s) => s.doc?.budgets.template.lines);
  const format = useFormat();
  if (!lines) return null;
  const all = Object.values(lines);
  const total = (cadence: BudgetTier) =>
    all.filter((l) => l.cadence === cadence).reduce((s, l) => s + l.defaultAmount, 0);
  const perYear = total('monthly') * 12 + total('annual');

  return (
    <div className={styles.root}>
      <p className={styles.intro}>Set default amounts for monthly and annual budgets.</p>
      <SortableProvider
        onReorder={(_, ids) => {
          tryRun('reorderTemplateLines', { ids });
        }}
      >
        <Section cadence="monthly" title="Monthly" lines={all} />
        <Section cadence="annual" title="Annual" lines={all} />
      </SortableProvider>
      <p className={styles.summary}>
        {format.money(total('monthly'))} a month × 12 + {format.money(total('annual'))} a year ={' '}
        <strong>{format.money(perYear)}</strong> per year
      </p>
    </div>
  );
}

function Section({
  cadence,
  title,
  lines,
}: {
  cadence: BudgetTier;
  title: string;
  lines: TemplateLine[];
}) {
  const format = useFormat();
  const list = lines.filter((l) => l.cadence === cadence).sort((a, b) => a.order - b.order);
  const hasEverythingElse = list.some((l) => l.target.kind === 'everythingElse');
  const total = list.reduce((s, l) => s + l.defaultAmount, 0);
  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>
        {title}
        <span className={styles.headingTotal}>{format.money(total)}</span>
      </h3>
      <BudgetLineHeader amount="Default" extra="Roll over" sortable />
      <SortableGroup ids={list.map((l) => l.id)}>
        {list.map((line) => (
          <LineRow key={line.id} line={line} />
        ))}
      </SortableGroup>
      <AddBudgetLine
        kind={cadence}
        canAddEverythingElse={!hasEverythingElse}
        onAdd={(target, defaultAmount) =>
          tryDispatch('createTemplateLine', { cadence, target, defaultAmount }) !== undefined
        }
      />
    </section>
  );
}

function LineRow({ line }: { line: TemplateLine }) {
  const doc = useDocStore((s) => s.doc);
  const { setNodeRef, style, isDragging, handle } = useSortableItem(
    line.id,
    `template-${line.cadence}`,
  );
  if (!doc) return null;
  const label = lineLabel(doc, line);
  const update = (changes: CommandPayload<'updateTemplateLine'>['changes']) => {
    tryRun('updateTemplateLine', { id: line.id, changes });
  };
  const policy = POLICIES.find((p) => p.value === line.rolloverPolicy)?.label;
  return (
    <BudgetLineRow
      rowRef={setNodeRef}
      style={style}
      className={clsx(isDragging && styles.dragging)}
      handle={<DragHandle handle={handle} label={`Reorder ${label}`} />}
      label={label}
      target={line.target}
      name={line.name}
      amount={line.defaultAmount}
      per={line.cadence === 'monthly' ? 'per month' : 'per year'}
      note={line.note}
      plan={line.plan}
      onTarget={(categoryIds) => {
        update({ target: { kind: 'categories', categoryIds } });
      }}
      onName={(name) => {
        update({ name });
      }}
      onAmount={(defaultAmount) => {
        update({ defaultAmount });
      }}
      onNote={(note) => {
        update({ note });
      }}
      onPlan={(plan) => {
        update({ plan });
      }}
      onDelete={() => {
        if (tryRun('deleteTemplateLine', { id: line.id })) toastWithUndo(`Deleted ${label}`);
      }}
      deleteLabel="Delete line"
      extra={{
        label: 'Roll over',
        summary: policy && `Roll over: ${policy}`,
        control: (place) => (
          <Select
            size="xs"
            {...(place === 'row'
              ? { variant: 'unstyled' }
              : { label: 'Roll over what’s left', maw: 200 })}
            aria-label="Rollover"
            data={POLICIES}
            value={line.rolloverPolicy}
            allowDeselect={false}
            onChange={(v) => {
              if (v) update({ rolloverPolicy: v });
            }}
          />
        ),
      }}
    />
  );
}

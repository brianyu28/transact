import { ActionIcon, Button, Select, TextInput, Tooltip } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { CategoryMultiSelect } from '@/components/CategoryMultiSelect/CategoryMultiSelect';
import { MoneyInput } from '@/components/MoneyInput/MoneyInput';
import { DragHandle, SortableGroup, SortableProvider } from '@/components/Sortable/Sortable';
import { useSortableItem } from '@/components/Sortable/useSortableItem';
import { lineLabel } from '@/domain/budgets/views';
import type { BudgetTier, Id, RolloverPolicy, TemplateLine } from '@/domain/schema/types';
import { useFormat } from '@/hooks/useFormat';
import { parseMoney } from '@/lib/money';
import { toastWithUndo, tryDispatch, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
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
      <div className={clsx(styles.row, styles.head)}>
        <span />
        <span>Categories</span>
        <span>Name (optional)</span>
        <span className={styles.num}>Default</span>
        <span>Roll over</span>
        <span />
      </div>
      <SortableGroup ids={list.map((l) => l.id)}>
        {list.map((line) => (
          <LineRow key={line.id} line={line} />
        ))}
      </SortableGroup>
      <AddLine cadence={cadence} hasEverythingElse={hasEverythingElse} />
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
  const label = lineLabel(doc, { target: line.target });
  return (
    <div ref={setNodeRef} style={style} className={clsx(styles.row, isDragging && styles.dragging)}>
      <DragHandle handle={handle} label={`Reorder ${label}`} />
      {line.target.kind === 'everythingElse' ? (
        <span className={styles.everythingElse}>Everything Else</span>
      ) : (
        <CategoryMultiSelect
          size="xs"
          variant="unstyled"
          expenseOnly
          aria-label="Categories"
          value={line.target.categoryIds}
          onChange={(ids) => {
            if (ids.length > 0)
              tryRun('updateTemplateLine', {
                id: line.id,
                changes: { target: { kind: 'categories', categoryIds: ids } },
              });
          }}
        />
      )}
      <TextInput
        size="xs"
        variant="unstyled"
        aria-label="Line name"
        placeholder={label}
        defaultValue={line.name ?? ''}
        onBlur={(e) => {
          const name = e.currentTarget.value;
          if (name !== (line.name ?? ''))
            tryRun('updateTemplateLine', { id: line.id, changes: { name } });
        }}
      />
      <MoneyInput
        size="xs"
        variant="unstyled"
        aria-label={`Default amount for ${label}`}
        value={line.defaultAmount}
        onCommit={(defaultAmount) => {
          tryRun('updateTemplateLine', { id: line.id, changes: { defaultAmount } });
        }}
      />
      <Select
        size="xs"
        variant="unstyled"
        aria-label="Rollover"
        data={POLICIES}
        value={line.rolloverPolicy}
        allowDeselect={false}
        onChange={(v) => {
          if (v)
            tryRun('updateTemplateLine', {
              id: line.id,
              changes: { rolloverPolicy: v },
            });
        }}
      />
      <Tooltip label="Delete line">
        <ActionIcon
          color="gray"
          aria-label={`Delete ${label}`}
          onClick={() => {
            if (tryRun('deleteTemplateLine', { id: line.id })) toastWithUndo(`Deleted ${label}`);
          }}
        >
          <IconTrash size={14} />
        </ActionIcon>
      </Tooltip>
    </div>
  );
}

function AddLine({
  cadence,
  hasEverythingElse,
}: {
  cadence: BudgetTier;
  hasEverythingElse: boolean;
}) {
  const [categories, setCategories] = useState<Id[]>([]);
  const [amount, setAmount] = useState('');
  const cents = parseMoney(amount);
  const add = () => {
    if (categories.length === 0 || cents === null) return;
    const id = tryDispatch('createTemplateLine', {
      cadence,
      target: { kind: 'categories', categoryIds: categories },
      defaultAmount: cents,
    });
    if (id) {
      setCategories([]);
      setAmount('');
    }
  };
  return (
    <div className={styles.add}>
      <CategoryMultiSelect
        size="xs"
        expenseOnly
        placeholder="Categories for a new line"
        aria-label={`New ${cadence} line categories`}
        value={categories}
        onChange={setCategories}
        className={styles.addCategories}
      />
      <TextInput
        size="xs"
        placeholder="Amount"
        aria-label="New line amount"
        inputMode="decimal"
        value={amount}
        onChange={(e) => {
          setAmount(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add();
        }}
        w={110}
      />
      <Button
        size="xs"
        leftSection={<IconPlus size={14} />}
        onClick={add}
        disabled={categories.length === 0 || cents === null}
      >
        Add line
      </Button>
      {!hasEverythingElse && (
        <Button
          size="xs"
          variant="subtle"
          onClick={() => {
            tryDispatch('createTemplateLine', {
              cadence,
              target: { kind: 'everythingElse' },
              defaultAmount: cents ?? 0,
            });
          }}
        >
          Add “Everything Else”
        </Button>
      )}
    </div>
  );
}

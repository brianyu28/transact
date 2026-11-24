import {
  ActionIcon,
  Button,
  Group,
  Modal,
  SegmentedControl,
  TagsInput,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { CategoryMultiSelect } from '@/components/CategoryMultiSelect/CategoryMultiSelect';
import { sortedTags } from '@/domain/aggregates/lookups';
import type { CustomBudgetInput } from '@/domain/commands';
import type { CustomBudget, Id } from '@/domain/schema/types';
import { isISODate } from '@/lib/date';
import { centsToInput, parseMoney } from '@/lib/money';
import { tryDispatch, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import styles from './CustomBudgetDialog.module.scss';

interface LineDraft {
  key: number;
  id?: Id;
  name: string;
  /** Empty = "everything else in this budget". */
  categoryIds: Id[];
  amount: string;
}

let nextKey = 1;

interface CustomBudgetDialogProps {
  /** Budget to edit, 'new' to create, or null when closed. */
  editing: CustomBudget | 'new' | null;
  onClose: () => void;
}

export function CustomBudgetDialog({ editing, onClose }: CustomBudgetDialogProps) {
  return (
    <Modal
      opened={editing !== null}
      onClose={onClose}
      title={editing === 'new' ? 'New custom budget' : 'Edit custom budget'}
      size="lg"
    >
      {editing !== null && (
        <CustomBudgetForm
          key={editing === 'new' ? 'new' : editing.id}
          budget={editing === 'new' ? undefined : editing}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function CustomBudgetForm({
  budget,
  onClose,
}: {
  budget: CustomBudget | undefined;
  onClose: () => void;
}) {
  const tags = useDocStore((s) => s.doc?.tags);
  const [name, setName] = useState(budget?.name ?? '');
  const [tagNames, setTagNames] = useState<string[]>(
    () => budget?.match.tags.map((id) => tags?.[id]?.name ?? '').filter(Boolean) ?? [],
  );
  const [mode, setMode] = useState<'any' | 'all'>(budget?.match.mode ?? 'any');
  const [start, setStart] = useState(budget?.dateRange?.start ?? '');
  const [end, setEnd] = useState(budget?.dateRange?.end ?? '');
  const [lines, setLines] = useState<LineDraft[]>(() =>
    budget
      ? budget.lines.map((l) => ({
          key: nextKey++,
          id: l.id,
          name: l.name,
          categoryIds: l.target.kind === 'categories' ? l.target.categoryIds : [],
          amount: centsToInput(l.amount),
        }))
      : [{ key: nextKey++, name: 'Total', categoryIds: [], amount: '' }],
  );

  const tagOptions = tags ? sortedTags({ tags }).map((t) => t.name) : [];
  const update = (key: number, patch: Partial<LineDraft>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const save = () => {
    const input: CustomBudgetInput = {
      name,
      tagNames,
      mode,
      dateRange:
        start || end
          ? { ...(isISODate(start) ? { start } : {}), ...(isISODate(end) ? { end } : {}) }
          : null,
      lines: lines
        .filter((l) => l.amount.trim() !== '')
        .map((l) => ({
          ...(l.id ? { id: l.id } : {}),
          name: l.name || (l.categoryIds.length ? '' : 'Everything else'),
          target: l.categoryIds.length
            ? { kind: 'categories' as const, categoryIds: l.categoryIds }
            : { kind: 'everythingElse' as const },
          amount: parseMoney(l.amount) ?? 0,
        })),
    };
    const ok = budget
      ? tryRun('updateCustomBudget', { id: budget.id, input })
      : tryDispatch('createCustomBudget', input) !== undefined;
    if (ok) onClose();
  };

  return (
    <div className={styles.form}>
      <TextInput
        data-autofocus
        label="Name"
        placeholder="e.g. Japan trip 2026"
        value={name}
        onChange={(e) => {
          setName(e.currentTarget.value);
        }}
      />
      <div className={styles.tagsRow}>
        <TagsInput
          label="Transactions tagged"
          description="Tagged spending counts here instead of your monthly and annual budgets."
          data={tagOptions}
          value={tagNames}
          onChange={setTagNames}
          acceptValueOnBlur
          className={styles.tags}
        />
        {tagNames.length > 1 && (
          <SegmentedControl
            size="xs"
            data={[
              { value: 'any', label: 'Any tag' },
              { value: 'all', label: 'All tags' },
            ]}
            value={mode}
            onChange={(v) => {
              setMode(v === 'all' ? 'all' : 'any');
            }}
          />
        )}
      </div>
      <Group grow>
        <TextInput
          type="date"
          label="From (optional)"
          value={start}
          onChange={(e) => {
            setStart(e.currentTarget.value);
          }}
        />
        <TextInput
          type="date"
          label="To (optional)"
          value={end}
          onChange={(e) => {
            setEnd(e.currentTarget.value);
          }}
        />
      </Group>

      <div>
        <Text size="sm" fw={500} mb={4}>
          Budget lines
        </Text>
        <Text size="xs" c="dimmed" mb="xs">
          Leave categories empty for a line that takes everything else in this budget.
        </Text>
        {lines.map((l) => (
          <div key={l.key} className={styles.line}>
            <TextInput
              size="xs"
              placeholder="Name"
              aria-label="Line name"
              value={l.name}
              onChange={(e) => {
                update(l.key, { name: e.currentTarget.value });
              }}
            />
            <CategoryMultiSelect
              size="xs"
              expenseOnly
              placeholder="Everything else"
              aria-label="Line categories"
              value={l.categoryIds}
              onChange={(ids) => {
                update(l.key, { categoryIds: ids });
              }}
            />
            <TextInput
              size="xs"
              placeholder="Amount"
              aria-label="Line amount"
              inputMode="decimal"
              value={l.amount}
              error={l.amount !== '' && parseMoney(l.amount) === null}
              onChange={(e) => {
                update(l.key, { amount: e.currentTarget.value });
              }}
            />
            <ActionIcon
              color="gray"
              aria-label="Remove line"
              onClick={() => {
                setLines((ls) => ls.filter((x) => x.key !== l.key));
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </div>
        ))}
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconPlus size={14} />}
          onClick={() => {
            setLines((ls) => [...ls, { key: nextKey++, name: '', categoryIds: [], amount: '' }]);
          }}
        >
          Add line
        </Button>
      </div>

      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>{budget ? 'Save' : 'Create budget'}</Button>
      </Group>
    </div>
  );
}

import { ActionIcon, Button, Checkbox, Group, Text, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { CategorySelect } from '@/components/CategorySelect/CategorySelect';
import { categoryValue, parseCategoryValue } from '@/components/CategorySelect/categoryValue';
import { getTransaction } from '@/domain/model';
import type { Id } from '@/domain/schema/types';
import { useFormat } from '@/hooks/useFormat';
import { centsToInput, parseMoney } from '@/lib/money';
import { tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import styles from './SplitEditor.module.scss';

interface Row {
  key: number;
  id?: Id;
  amount: string;
  category: string;
  excluded: boolean;
  note: string;
}

let nextKey = 1;

/**
 * Edits a transaction's splits. Amounts are entered without a sign (they share the
 * transaction's direction); they must add up to the total. One split = not split.
 */
export function SplitEditor({ id, onDone }: { id: Id; onDone: () => void }) {
  const t = useDocStore((s) => (s.doc ? getTransaction(s.doc, id) : undefined));
  const format = useFormat();
  const [rows, setRows] = useState<Row[]>(() => {
    if (!t) return [];
    if (t.splits) {
      return t.splits.map((s) => ({
        key: nextKey++,
        id: s.id,
        amount: centsToInput(Math.abs(s.amount)),
        category: categoryValue(s.categoryId),
        excluded: s.excluded === true,
        note: s.note ?? '',
      }));
    }
    return [
      {
        key: nextKey++,
        amount: centsToInput(Math.abs(t.amount)),
        category: categoryValue(t.categoryId),
        excluded: false,
        note: '',
      },
      { key: nextKey++, amount: '', category: '', excluded: false, note: '' },
    ];
  });
  if (!t) return null;

  const sign = t.amount < 0 ? -1 : 1;
  const total = Math.abs(t.amount);
  const parsed = rows.map((r) => (r.amount.trim() === '' ? 0 : parseMoney(r.amount)));
  const valid = parsed.every((c) => c !== null);
  const sum = parsed.reduce<number>((s, c) => s + Math.abs(c ?? 0), 0);
  const remaining = total - sum;

  const update = (key: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const save = () => {
    const kept = rows.filter((_, i) => (parsed[i] ?? 0) !== 0 || rows.length === 1);
    const splits = kept.map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      amount: sign * Math.abs(parseMoney(r.amount) ?? 0),
      categoryId: parseCategoryValue(r.category).categoryId ?? undefined,
      excluded: r.excluded,
      note: r.note,
    }));
    if (tryRun('setSplits', { id, splits })) onDone();
  };

  return (
    <div>
      <Text size="sm" mb="sm">
        {t.payee || 'Transaction'} · {format.date(t.date)} ·{' '}
        <strong>{format.money(t.amount)}</strong>
      </Text>
      <div className={styles.grid}>
        <span className={styles.head}>Amount</span>
        <span className={styles.head}>Category</span>
        <span className={styles.head}>Note</span>
        <span className={styles.head} title="Excluded from budgets">
          Excl.
        </span>
        <span />
        {rows.map((r, i) => (
          <SplitRow
            key={r.key}
            row={r}
            invalid={parsed[i] === null}
            onChange={(patch) => {
              update(r.key, patch);
            }}
            onRemove={
              rows.length > 1
                ? () => {
                    setRows((rs) => rs.filter((x) => x.key !== r.key));
                  }
                : undefined
            }
          />
        ))}
      </div>
      <Group justify="space-between" mt="sm">
        <Group gap="xs">
          <Button
            size="xs"
            variant="subtle"
            leftSection={<IconPlus size={14} />}
            onClick={() => {
              setRows((rs) => [
                ...rs,
                {
                  key: nextKey++,
                  amount: remaining > 0 ? centsToInput(remaining) : '',
                  category: '',
                  excluded: false,
                  note: '',
                },
              ]);
            }}
          >
            Add split
          </Button>
          <Text size="sm" className={clsx(styles.remaining, remaining !== 0 && styles.off)}>
            {remaining === 0
              ? 'Fully allocated'
              : `${format.money(remaining, { symbol: true })} ${remaining > 0 ? 'unallocated' : 'over'}`}
          </Text>
        </Group>
        <Group gap="xs">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid || remaining !== 0}>
            Save
          </Button>
        </Group>
      </Group>
    </div>
  );
}

function SplitRow({
  row,
  invalid,
  onChange,
  onRemove,
}: {
  row: Row;
  invalid: boolean;
  onChange: (patch: Partial<Row>) => void;
  onRemove: (() => void) | undefined;
}) {
  return (
    <>
      <TextInput
        size="xs"
        aria-label="Split amount"
        inputMode="decimal"
        value={row.amount}
        error={invalid}
        onChange={(e) => {
          onChange({ amount: e.currentTarget.value });
        }}
        classNames={{ input: styles.amount }}
      />
      <CategorySelect
        size="xs"
        aria-label="Split category"
        value={row.category}
        onChange={(v) => {
          onChange({ category: v });
        }}
      />
      <TextInput
        size="xs"
        aria-label="Split note"
        value={row.note}
        onChange={(e) => {
          onChange({ note: e.currentTarget.value });
        }}
      />
      <Checkbox
        size="xs"
        aria-label="Exclude from budgets"
        checked={row.excluded}
        onChange={(e) => {
          onChange({ excluded: e.currentTarget.checked });
        }}
        className={styles.check}
      />
      {onRemove ? (
        <ActionIcon color="gray" aria-label="Remove split" onClick={onRemove}>
          <IconTrash size={14} />
        </ActionIcon>
      ) : (
        <span />
      )}
    </>
  );
}

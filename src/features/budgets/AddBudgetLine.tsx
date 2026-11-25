import { Button, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { CategoryMultiSelect } from '@/components/CategoryMultiSelect/CategoryMultiSelect';
import type { BudgetTarget, Cents, Id } from '@/domain/schema/types';
import { parseMoney } from '@/lib/money';
import styles from './AddBudgetLine.module.scss';

interface AddBudgetLineProps {
  /** For labels, e.g. "monthly". */
  kind: string;
  /** Offer an "Everything Else" line (when there isn't one yet). */
  canAddEverythingElse: boolean;
  /** Returns whether the line was added (the fields clear then). */
  onAdd: (target: BudgetTarget, amount: Cents) => boolean;
  /** More ways to add, e.g. a menu of default lines. */
  children?: ReactNode;
}

/** Categories + amount fields for adding a budget line. */
export function AddBudgetLine({ kind, canAddEverythingElse, onAdd, children }: AddBudgetLineProps) {
  const [categories, setCategories] = useState<Id[]>([]);
  const [amount, setAmount] = useState('');
  const cents = parseMoney(amount);
  const add = () => {
    if (categories.length === 0 || cents === null) return;
    if (onAdd({ kind: 'categories', categoryIds: categories }, cents)) {
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
        aria-label={`New ${kind} line categories`}
        value={categories}
        onChange={setCategories}
        className={styles.categories}
      />
      <div className={styles.controls}>
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
          className={styles.amount}
        />
        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={add}
          disabled={categories.length === 0 || cents === null}
        >
          Add line
        </Button>
        {canAddEverythingElse && (
          <Button
            size="xs"
            variant="subtle"
            onClick={() => {
              if (onAdd({ kind: 'everythingElse' }, cents ?? 0)) setAmount('');
            }}
          >
            Add “Everything Else”
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}

import { Select, type SelectProps } from '@mantine/core';
import { useMemo } from 'react';
import { categoryTree, sortedAccounts } from '@/domain/aggregates/lookups';
import type { Id } from '@/domain/schema/types';
import { useDocStore } from '@/store/docStore';
import { categoryValue, transferValue, type CategoryValue } from './categoryValue';

interface CategorySelectProps extends Omit<SelectProps, 'data' | 'value' | 'onChange'> {
  value: CategoryValue;
  onChange: (value: CategoryValue) => void;
  /** Offer "Transfer ↔ account" options (excluding this account). */
  transfersFrom?: Id | null;
}

/** Searchable category picker with full paths ("Food › Groceries"), plus optional transfers. */
export function CategorySelect({ value, onChange, transfersFrom, ...props }: CategorySelectProps) {
  const categories = useDocStore((s) => s.doc?.categories);
  const accounts = useDocStore((s) => s.doc?.accounts);

  const data = useMemo(() => {
    if (!categories || !accounts) return [];
    const tree = categoryTree(categories);
    const groups = [
      {
        group: 'Categories',
        items: tree.nodes
          .filter((n) => !n.category.archived || categoryValue(n.category.id) === value)
          .map((n) => ({ value: categoryValue(n.category.id), label: n.path })),
      },
    ];
    if (transfersFrom !== undefined) {
      groups.push({
        group: 'Transfer',
        items: sortedAccounts({ accounts })
          .filter((a) => a.id !== transfersFrom && (!a.closed || transferValue(a.id) === value))
          .map((a) => ({ value: transferValue(a.id), label: `Transfer ↔ ${a.name}` })),
      });
    }
    return groups;
  }, [categories, accounts, transfersFrom, value]);

  return (
    <Select
      searchable
      clearable
      // Typing then Enter picks the best match.
      selectFirstOptionOnChange
      placeholder="Uncategorized"
      nothingFoundMessage="No match"
      maxDropdownHeight={320}
      comboboxProps={{ width: 280, position: 'bottom-start' }}
      {...props}
      data={data}
      value={value || null}
      onChange={(v) => {
        onChange(v ?? '');
      }}
    />
  );
}

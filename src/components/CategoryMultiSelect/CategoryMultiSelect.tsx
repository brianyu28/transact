import { MultiSelect, type MultiSelectProps } from '@mantine/core';
import { useMemo } from 'react';
import { categoryTree } from '@/domain/aggregates/lookups';
import type { Id } from '@/domain/schema/types';
import { useDocStore } from '@/store/docStore';
import { wordFilter } from '@/components/CategorySelect/wordFilter';

interface CategoryMultiSelectProps extends Omit<MultiSelectProps, 'data' | 'value' | 'onChange'> {
  value: Id[];
  onChange: (ids: Id[]) => void;
  /** Only offer expense categories (for budget lines). */
  expenseOnly?: boolean;
}

/** Pick one or more categories by full path ("Food › Groceries"). */
export function CategoryMultiSelect({
  value,
  onChange,
  expenseOnly,
  placeholder,
  ...props
}: CategoryMultiSelectProps) {
  const categories = useDocStore((s) => s.doc?.categories);
  const data = useMemo(() => {
    if (!categories) return [];
    return categoryTree(categories)
      .nodes.filter(
        (n) =>
          (!n.category.archived || value.includes(n.category.id)) &&
          (!expenseOnly || n.kind === 'expense'),
      )
      .map((n) => ({ value: n.category.id, label: n.path }));
  }, [categories, expenseOnly, value]);
  return (
    <MultiSelect
      searchable
      hidePickedOptions
      selectFirstOptionOnChange
      filter={wordFilter}
      maxDropdownHeight={280}
      {...props}
      // Mantine keeps the placeholder in the search field after picks; show it only when empty.
      placeholder={value.length ? undefined : placeholder}
      data={data}
      value={value}
      onChange={onChange}
    />
  );
}

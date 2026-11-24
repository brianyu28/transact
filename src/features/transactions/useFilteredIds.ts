import { useDebouncedValue } from '@mantine/hooks';
import { useMemo } from 'react';
import { compileFilter, type CompiledFilter } from '@/domain/transactions/filter';
import { runFilter } from '@/domain/transactions/query';
import type { Id } from '@/domain/schema/types';
import { today } from '@/lib/date';
import { useDocStore } from '@/store/docStore';
import { useRegister } from './registerStore';

/** Transaction ids matching the register's filter, newest first. */
export function useFilteredIds(): { ids: Id[]; filter: CompiledFilter | null } {
  const query = useRegister((s) => s.query);
  const [debounced] = useDebouncedValue(query, 120);
  const doc = useDocStore((s) => s.doc);
  const index = useDocStore((s) => s.index);
  const indexVersion = useDocStore((s) => s.indexVersion);
  const accounts = doc?.accounts;
  const categories = doc?.categories;
  const tags = doc?.tags;

  const filter = useMemo(
    () =>
      accounts && categories && tags
        ? compileFilter(debounced, { accounts, categories, tags }, today())
        : null,
    [debounced, accounts, categories, tags],
  );

  // Recompute when the filter or the transactions change (indexVersion), not on every
  // document edit (e.g. a renamed tag changes `doc` but is covered by `filter`).
  const ids = useMemo(
    () => (doc && index && filter ? runFilter(doc, index, filter) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [filter, index, indexVersion],
  );

  return { ids, filter };
}

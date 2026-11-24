import { useMemo } from 'react';
import { getTransaction } from '@/domain/model';
import type { Id } from '@/domain/schema/types';
import type { CompiledFilter } from '@/domain/transactions/filter';
import { useDocStore } from '@/store/docStore';

export const isSnapshotRow = (id: Id) => id.startsWith('snp_');

/**
 * Register rows: the filtered transaction ids, plus the account's balance updates
 * interleaved by date when the filter is just one account (so jumps in the running
 * balance are explained). A balance update applies at the start of its day, so it sits
 * below that day's transactions in the newest-first list.
 */
export function useRegisterRows(
  ids: Id[],
  filter: CompiledFilter | null,
  accountId: Id | null,
): Id[] {
  const snapshots = useDocStore((s) => s.doc?.balanceSnapshots);
  const transactions = useDocStore((s) => s.doc?.transactions);
  return useMemo(() => {
    const onlyAccount =
      filter?.terms.length && filter.terms.every((t) => t.kind === 'account' && !t.negated);
    if (!accountId || !onlyAccount || !snapshots || !transactions) return ids;
    const snaps = Object.values(snapshots)
      .filter((s) => s.accountId === accountId)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    if (snaps.length === 0) return ids;
    const out: Id[] = [];
    let j = 0;
    for (const id of ids) {
      const date = getTransaction({ transactions }, id)?.date ?? '';
      while (j < snaps.length && (snaps[j]?.date ?? '') > date)
        out.push((snaps[j++] as { id: Id }).id);
      out.push(id);
    }
    while (j < snaps.length) out.push((snaps[j++] as { id: Id }).id);
    return out;
  }, [ids, filter, accountId, snapshots, transactions]);
}

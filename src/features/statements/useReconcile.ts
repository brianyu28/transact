import { useMemo } from 'react';
import type { Id } from '@/domain/schema/types';
import {
  reconcileCandidates,
  statementSummary,
  type Candidate,
  type StatementSummary,
} from '@/domain/statements/reconcile';
import { useDocStore } from '@/store/docStore';

export function useReconcile(
  statementId: Id,
): { candidates: Candidate[]; summary: StatementSummary } | null {
  const statement = useDocStore((s) => s.doc?.statements[statementId]);
  const transactions = useDocStore((s) => s.doc?.transactions);
  const index = useDocStore((s) => s.index);
  const indexVersion = useDocStore((s) => s.indexVersion);
  const grace = useDocStore((s) => s.doc?.settings.reconcileGraceDays ?? 7);
  return useMemo(() => {
    if (!statement || !transactions || !index) return null;
    const candidates = reconcileCandidates({ transactions }, index, statement, grace);
    const summary = statementSummary(
      statement,
      candidates.filter((c) => c.checked).map((c) => c.transaction),
    );
    return { candidates, summary };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indexVersion tracks in-place index changes.
  }, [statement, transactions, index, indexVersion, grace]);
}

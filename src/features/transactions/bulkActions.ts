/** Actions on one or more transactions (from the bulk bar or keyboard). */
import { getTransaction } from '@/domain/model';
import type { Id } from '@/domain/schema/types';
import { pluralize } from '@/lib/format';
import { toastWithUndo, tryRun } from '@/store/actions';
import { docStore } from '@/store/docStore';
import { registerStore } from './registerStore';

function every(
  ids: readonly Id[],
  test: (t: NonNullable<ReturnType<typeof getTransaction>>) => boolean,
): boolean {
  const doc = docStore.getState().doc;
  return (
    doc !== null &&
    ids.every((id) => {
      const t = getTransaction(doc, id);
      return t !== undefined && test(t);
    })
  );
}

export const bulkActions = {
  /** Marks all reconciled, or unmarks all if they already are. */
  toggleReconciled(ids: readonly Id[]) {
    if (ids.length === 0) return;
    tryRun('updateTransactions', {
      ids,
      changes: { reconciled: !every(ids, (t) => t.reconciled === true) },
    });
  },
  toggleExcluded(ids: readonly Id[]) {
    if (ids.length === 0) return;
    tryRun('updateTransactions', {
      ids,
      changes: { excluded: !every(ids, (t) => t.excluded === true) },
    });
  },
  delete(ids: readonly Id[]) {
    if (ids.length === 0) return;
    if (tryRun('deleteTransactions', { ids })) {
      registerStore.setState({ selected: new Set(), activeId: null });
      toastWithUndo(`Deleted ${pluralize(ids.length, 'transaction')}`);
    }
  },
};

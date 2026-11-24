import { useMediaQuery } from '@mantine/hooks';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { balanceAfterTransaction, getLedger } from '@/domain/aggregates/balances';
import { getTransaction } from '@/domain/model';
import type { Id, Transaction } from '@/domain/schema/types';
import { useFormat } from '@/hooks/useFormat';
import { tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { usePrefs } from '@/store/prefsStore';
import { registerActions, registerStore, useRegister } from './registerStore';
import { rowLabels } from './rowLabels';
import { TransactionEditor } from './TransactionEditor';
import { SnapshotRow } from './SnapshotRow';
import { EDITOR_SHEET_QUERY, PHONE_QUERY } from './media';
import { TransactionRow } from './TransactionRow';
import { isSnapshotRow } from './useRegisterRows';
import styles from './TransactionGrid.module.scss';

interface TransactionGridProps {
  ids: readonly Id[];
  /** When set (filtered to one account), shows a running balance instead of the account. */
  balanceAccountId: Id | null;
  defaultAccountId: Id | null;
  /** Called with a function that scrolls a row into view (for keyboard navigation). */
  onScrollerReady: (scrollTo: (id: Id) => void) => void;
  /** Rendered above the rows (e.g. the new-transaction entry row). */
  before?: ReactNode;
  empty: ReactNode;
}

export function TransactionGrid({
  ids,
  balanceAccountId,
  defaultAccountId,
  onScrollerReady,
  before,
  empty,
}: TransactionGridProps) {
  const doc = useDocStore((s) => s.doc);
  const index = useDocStore((s) => s.index);
  const activeId = useRegister((s) => s.activeId);
  const selected = useRegister((s) => s.selected);
  const editing = useRegister((s) => s.editing);
  const density = usePrefs((s) => s.density);
  const phone = useMediaQuery(PHONE_QUERY);
  const sheet = useMediaQuery(EDITOR_SHEET_QUERY);
  const format = useFormat();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rowHeight = phone ? 52 : density === 'comfortable' ? 34 : 26;

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns unstable functions by design.
  const virtualizer = useVirtualizer({
    count: ids.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: (i) => (ids[i] === editing && !sheet ? 72 : rowHeight),
    getItemKey: (i) => ids[i] ?? i,
    overscan: 16,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, editing, virtualizer]);

  useEffect(() => {
    onScrollerReady((id) => {
      const index = ids.indexOf(id);
      if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' });
    });
  }, [ids, virtualizer, onScrollerReady]);

  const onRowClick = useCallback(
    (t: Transaction, e: MouseEvent) => {
      const { activeId: current } = registerStore.getState();
      if (phone) {
        registerStore.setState({ activeId: t.id, editing: t.id });
        return;
      }
      if (e.shiftKey && current) registerActions.selectRange(ids, current, t.id);
      else if (e.metaKey || e.ctrlKey) registerActions.toggleSelected(t.id);
      registerStore.setState({ activeId: t.id });
    },
    [ids, phone],
  );
  const onRowDoubleClick = useCallback((t: Transaction) => {
    registerStore.setState({ activeId: t.id, editing: t.id });
  }, []);
  const onToggleSelect = useCallback((t: Transaction) => {
    registerActions.toggleSelected(t.id);
    registerStore.setState({ activeId: t.id });
  }, []);
  const onToggleReconciled = useCallback((t: Transaction) => {
    tryRun('updateTransaction', {
      id: t.id,
      changes: { reconciled: t.reconciled ? undefined : true },
    });
  }, []);

  if (!doc) return null;

  return (
    <div className={styles.root}>
      <div className={styles.header} role="row">
        <span />
        <span>Date</span>
        <span className={styles.amount}>Amount</span>
        <span>Payee</span>
        <span className={balanceAccountId ? styles.amount : undefined}>
          {balanceAccountId ? 'Balance' : 'Account'}
        </span>
        <span>Category</span>
        <span>Tags</span>
        <span />
      </div>
      {before}
      <div className={styles.scroller} ref={scrollerRef} role="grid" aria-rowcount={ids.length}>
        {ids.length === 0 ? (
          <div className={styles.empty}>{empty}</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const id = ids[item.index] as Id;
              if (isSnapshotRow(id)) {
                const snapshot = doc.balanceSnapshots[id];
                const anchor =
                  snapshot && index
                    ? getLedger(doc, index, snapshot.accountId).anchors.find(
                        (a) => a.snapshot.id === id,
                      )
                    : undefined;
                if (!anchor) return null;
                return (
                  <div
                    key={item.key}
                    data-index={item.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${item.start}px)`,
                    }}
                  >
                    <SnapshotRow
                      anchor={anchor}
                      date={format.date(anchor.snapshot.date)}
                      adjustment={format.money(anchor.adjustment, { sign: 'always' })}
                      balance={format.money(anchor.snapshot.balance)}
                      active={activeId === id}
                      onClick={() => {
                        registerStore.setState({ activeId: id });
                      }}
                    />
                  </div>
                );
              }
              const t = getTransaction(doc, id);
              if (!t) return null;
              return (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  {editing === id && !sheet ? (
                    <TransactionEditor
                      transaction={t}
                      layout="row"
                      defaultAccountId={defaultAccountId}
                      onDone={() => {
                        registerStore.setState({ editing: null });
                      }}
                    />
                  ) : (
                    <TransactionRow
                      t={t}
                      labels={rowLabels(t, doc)}
                      date={format.date(t.date)}
                      amount={format.money(t.amount)}
                      balance={
                        balanceAccountId && index
                          ? format.money(balanceAfterTransaction(doc, index, t))
                          : undefined
                      }
                      active={activeId === id}
                      selected={selected.has(id)}
                      phone={phone}
                      onRowClick={onRowClick}
                      onRowDoubleClick={onRowDoubleClick}
                      onToggleSelect={onToggleSelect}
                      onToggleReconciled={onToggleReconciled}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

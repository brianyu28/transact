import { ActionIcon, Button, Modal } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useRef } from 'react';
import { sortedAccounts } from '@/domain/aggregates/lookups';
import { getTransaction } from '@/domain/model';
import type { Id } from '@/domain/schema/types';
import { useCommandHandlers } from '@/keyboard/useCommandHandlers';
import { docStore, useDocStore } from '@/store/docStore';
import { bulkActions } from './bulkActions';
import { FilterBar } from './FilterBar';
import { RegisterDialogs } from './RegisterDialogs';
import { registerActions, registerStore, useRegister } from './registerStore';
import { TransactionEditor } from './TransactionEditor';
import { StatusBar } from './StatusBar';
import { TransactionGrid } from './TransactionGrid';
import { useFilteredIds } from './useFilteredIds';
import styles from './TransactionsPage.module.scss';

const PHONE_QUERY = '(max-width: 639.98px)';

export function TransactionsPage() {
  const { ids, filter } = useFilteredIds();
  const editing = useRegister((s) => s.editing);
  const accounts = useDocStore((s) => s.doc?.accounts);
  const doc = useDocStore((s) => s.doc);
  const phone = useMediaQuery(PHONE_QUERY);
  const filterRef = useRef<HTMLInputElement>(null);
  const scrollTo = useRef<(id: Id) => void>(() => undefined);
  const onScrollerReady = useCallback((fn: (id: Id) => void) => {
    scrollTo.current = fn;
  }, []);

  // New transactions default to the filtered account, else the first open account.
  const filteredAccount =
    filter?.accountIds?.size === 1 ? ([...filter.accountIds][0] ?? null) : null;
  const defaultAccountId =
    filteredAccount ??
    (accounts ? (sortedAccounts({ accounts }).find((a) => !a.closed)?.id ?? null) : null);

  // Keep the cursor on a visible row.
  useEffect(() => {
    const { activeId } = registerStore.getState();
    if (activeId && !ids.includes(activeId)) registerStore.setState({ activeId: ids[0] ?? null });
  }, [ids]);

  const move = (delta: number) => {
    const { activeId } = registerStore.getState();
    const i = activeId ? ids.indexOf(activeId) : -1;
    const next = ids[Math.max(0, Math.min(ids.length - 1, i + delta))];
    if (next) {
      registerStore.setState({ activeId: next });
      scrollTo.current(next);
    }
  };
  const notEditing = () => registerStore.getState().editing === null;
  const hasTargets = () => notEditing() && registerActions.targets().length > 0;
  const activeTransaction = () => {
    const { activeId } = registerStore.getState();
    const d = docStore.getState().doc;
    return activeId && d ? getTransaction(d, activeId) : undefined;
  };

  useCommandHandlers({
    'txn.new': {
      run: () => {
        registerStore.setState({ editing: 'new' });
      },
      enabled: () => defaultAccountId !== null,
    },
    'txn.filter': {
      run: () => {
        filterRef.current?.focus();
        filterRef.current?.select();
      },
    },
    'txn.next': {
      run: () => {
        move(1);
      },
      enabled: notEditing,
    },
    'txn.prev': {
      run: () => {
        move(-1);
      },
      enabled: notEditing,
    },
    'txn.select': {
      run: () => {
        const { activeId } = registerStore.getState();
        if (activeId) registerActions.toggleSelected(activeId);
      },
      enabled: () => notEditing() && registerStore.getState().activeId !== null,
    },
    'txn.selectAll': {
      run: () => {
        registerStore.setState({ selected: new Set(ids) });
      },
      enabled: notEditing,
    },
    'txn.clear': {
      run: registerActions.clearSelection,
      enabled: () => notEditing() && registerStore.getState().selected.size > 0,
    },
    'txn.edit': {
      run: () => {
        registerStore.setState({ editing: registerStore.getState().activeId });
      },
      enabled: () => notEditing() && registerStore.getState().activeId !== null,
    },
    'txn.category': {
      run: () => {
        registerStore.setState({ dialog: { kind: 'category', ids: registerActions.targets() } });
      },
      enabled: hasTargets,
    },
    'txn.tags': {
      run: () => {
        registerStore.setState({ dialog: { kind: 'tags', ids: registerActions.targets() } });
      },
      enabled: hasTargets,
    },
    'txn.reconcile': {
      run: () => {
        bulkActions.toggleReconciled(registerActions.targets());
      },
      enabled: hasTargets,
    },
    'txn.exclude': {
      run: () => {
        bulkActions.toggleExcluded(registerActions.targets());
      },
      enabled: hasTargets,
    },
    'txn.split': {
      run: () => {
        const t = activeTransaction();
        if (t) registerStore.setState({ dialog: { kind: 'split', id: t.id } });
      },
      enabled: () =>
        notEditing() &&
        activeTransaction()?.transfer === undefined &&
        activeTransaction() !== undefined,
    },
    'txn.delete': {
      run: () => {
        bulkActions.delete(registerActions.targets());
      },
      enabled: hasTargets,
    },
  });

  const stopEditing = () => {
    registerStore.setState({ editing: null });
  };
  const editingTransaction =
    editing && editing !== 'new' && doc ? getTransaction(doc, editing) : undefined;
  const noAccounts = defaultAccountId === null;

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <FilterBar filter={filter} inputRef={filterRef} />
        <Button
          className={styles.newButton}
          leftSection={<IconPlus size={14} />}
          disabled={noAccounts}
          onClick={() => {
            registerStore.setState({ editing: 'new' });
          }}
        >
          New
        </Button>
      </div>
      <TransactionGrid
        ids={ids}
        defaultAccountId={defaultAccountId}
        onScrollerReady={onScrollerReady}
        before={
          editing === 'new' && !phone ? (
            <TransactionEditor
              layout="row"
              defaultAccountId={defaultAccountId}
              onDone={stopEditing}
            />
          ) : null
        }
        empty={
          noAccounts
            ? 'Add an account in Settings → Accounts to start entering transactions.'
            : filter?.terms.length
              ? 'No transactions match this filter.'
              : 'No transactions yet. Press N to add one.'
        }
      />
      <StatusBar ids={ids} />
      <RegisterDialogs />
      {phone && (
        <>
          <ActionIcon
            className={styles.fab}
            size={48}
            radius="xl"
            variant="filled"
            aria-label="New transaction"
            disabled={noAccounts}
            onClick={() => {
              registerStore.setState({ editing: 'new' });
            }}
          >
            <IconPlus size={22} />
          </ActionIcon>
          <Modal
            opened={editing !== null}
            onClose={stopEditing}
            fullScreen
            title={editing === 'new' ? 'New transaction' : 'Edit transaction'}
          >
            {editing !== null && (
              <TransactionEditor
                key={editing}
                layout="stack"
                transaction={editingTransaction}
                defaultAccountId={defaultAccountId}
                onDone={stopEditing}
              />
            )}
          </Modal>
        </>
      )}
    </div>
  );
}

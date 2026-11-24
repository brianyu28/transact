import { Anchor, Badge, Button, Checkbox, Group, Menu, Switch } from '@mantine/core';
import {
  IconArrowLeft,
  IconChecks,
  IconDots,
  IconLockOpen,
  IconScale,
  IconTrash,
} from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { StatTile } from '@/components/StatTile/StatTile';
import type { Id } from '@/domain/schema/types';
import type { Candidate } from '@/domain/statements/reconcile';
import { rowLabels } from '@/features/transactions/rowLabels';
import { useFormat } from '@/hooks/useFormat';
import { useCommandHandlers } from '@/keyboard/useCommandHandlers';
import { toastWithUndo, tryDispatch, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { useReconcile } from './useReconcile';
import styles from './ReconcileWorkspace.module.scss';

const POSITION_LABEL: Record<Candidate['position'], string | null> = {
  earlier: 'Older, uncleared',
  before: 'Before period',
  in: null,
  after: 'After period',
};

/** Check transactions off against a statement until the difference is zero. */
export function ReconcileWorkspace({ id }: { id: Id }) {
  const statement = useDocStore((s) => s.doc?.statements[id]);
  const doc = useDocStore((s) => s.doc);
  const data = useReconcile(id);
  const format = useFormat();
  const [, navigate] = useLocation();
  const [active, setActive] = useState(0);
  const [recordBalance, setRecordBalance] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  // A finished statement lists just its own transactions.
  const candidates = (data?.candidates ?? []).filter(
    (c) => statement?.status !== 'reconciled' || c.checked,
  );
  const toggle = (ids: Id[], member: boolean) => {
    tryRun('setStatementMembership', { statementId: id, ids, member });
  };

  useCommandHandlers({
    'txn.next': {
      run: () => {
        setActive((i) => Math.min(i + 1, candidates.length - 1));
      },
    },
    'txn.prev': {
      run: () => {
        setActive((i) => Math.max(i - 1, 0));
      },
    },
    'txn.select': {
      run: () => {
        const c = candidates[active];
        if (c) toggle([c.transaction.id], !c.checked);
      },
      enabled: () => candidates.length > 0,
    },
  });

  useEffect(() => {
    listRef.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!statement || !doc || !data) {
    return (
      <p className={styles.root}>
        Statement not found.{' '}
        <Anchor component={Link} href="/statements">
          Back to statements
        </Anchor>
      </p>
    );
  }

  const { summary } = data;
  const account = doc.accounts[statement.accountId];
  const reconciled = statement.status === 'reconciled';
  const balanced = summary.difference === 0;
  const inPeriodUnchecked = candidates
    .filter((c) => c.position === 'in' && !c.checked)
    .map((c) => c.transaction.id);

  return (
    <div className={styles.root}>
      <Link href="/statements" className={styles.back}>
        <IconArrowLeft size={14} /> Statements
      </Link>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>
            {account?.name ?? 'Unknown account'}{' '}
            {reconciled && (
              <Badge size="sm" variant="light" color="green" ml={4}>
                Reconciled
              </Badge>
            )}
          </h2>
          <p className={styles.subtitle}>
            {format.date(statement.startDate)} – {format.date(statement.endDate)}
          </p>
        </div>
        <Menu position="bottom-end">
          <Menu.Target>
            <Button variant="subtle" color="gray" px={6} aria-label="Statement actions">
              <IconDots size={16} />
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {reconciled && (
              <Menu.Item
                leftSection={<IconLockOpen size={14} />}
                onClick={() => tryRun('reopenStatement', { id })}
              >
                Reopen to make changes
              </Menu.Item>
            )}
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => {
                if (tryRun('deleteStatement', { id })) {
                  toastWithUndo('Deleted statement');
                  navigate('/statements');
                }
              }}
            >
              Delete statement
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </header>

      <div className={styles.summary}>
        <StatTile label="Opening balance" value={format.money(statement.openingBalance)} />
        <StatTile
          label={`Cleared (${summary.count})`}
          value={format.money(summary.clearedChange, { sign: 'always' })}
        />
        <StatTile label="Cleared balance" value={format.money(summary.clearedBalance)} />
        <StatTile label="Statement balance" value={format.money(statement.closingBalance)} />
        <div
          className={clsx(styles.difference, balanced ? styles.balanced : styles.unbalanced)}
          role="status"
        >
          <span className={styles.differenceLabel}>Difference</span>
          <span className={styles.differenceValue}>
            {balanced ? 'Balanced' : format.money(summary.difference, { sign: 'always' })}
          </span>
        </div>
      </div>

      {!reconciled && (
        <div className={styles.actions}>
          <Group gap="xs">
            <Button
              size="xs"
              variant="default"
              leftSection={<IconChecks size={14} />}
              disabled={inPeriodUnchecked.length === 0}
              onClick={() => {
                toggle(inPeriodUnchecked, true);
              }}
            >
              Check all in period ({inPeriodUnchecked.length})
            </Button>
            {!balanced && (
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<IconScale size={14} />}
                onClick={() => {
                  tryDispatch('addReconcileAdjustment', {
                    statementId: id,
                    amount: summary.difference,
                  });
                }}
              >
                Add {format.money(summary.difference, { sign: 'always' })} adjustment
              </Button>
            )}
          </Group>
          <Group gap="sm">
            <Switch
              size="xs"
              label="Record statement balance"
              checked={recordBalance}
              onChange={(e) => {
                setRecordBalance(e.currentTarget.checked);
              }}
            />
            <Button
              disabled={!balanced}
              onClick={() => {
                if (tryRun('finishStatement', { id, recordBalance }))
                  toastWithUndo('Statement reconciled');
              }}
            >
              Finish
            </Button>
          </Group>
        </div>
      )}

      <div className={styles.list} ref={listRef} role="grid" aria-label="Transactions to reconcile">
        {candidates.length === 0 && (
          <p className={styles.empty}>No transactions to reconcile in this period.</p>
        )}
        {candidates.map((c, i) => {
          const t = c.transaction;
          const labels = rowLabels(t, doc);
          const tag = POSITION_LABEL[c.position];
          return (
            <div
              key={t.id}
              data-row={i}
              role="row"
              aria-selected={c.checked}
              className={clsx(
                styles.row,
                i === active && styles.active,
                c.checked && styles.checked,
                c.position !== 'in' && styles.outside,
              )}
              onClick={() => {
                setActive(i);
                toggle([t.id], !c.checked);
              }}
            >
              <Checkbox
                size="xs"
                checked={c.checked}
                readOnly
                tabIndex={-1}
                aria-label={c.checked ? 'Cleared' : 'Not cleared'}
              />
              <span className={styles.date}>{format.date(t.date)}</span>
              <span className={clsx(styles.amount, t.amount > 0 && styles.positive)}>
                {format.money(t.amount)}
              </span>
              <span className={styles.payee}>{t.payee}</span>
              <span className={styles.category}>{labels.category}</span>
              <span className={styles.tag}>{tag}</span>
            </div>
          );
        })}
      </div>
      <p className={styles.hint}>Click a row or press X to check it off · J/K to move</p>
    </div>
  );
}

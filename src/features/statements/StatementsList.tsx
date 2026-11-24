import { Badge, Button, Select } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { sortedAccounts } from '@/domain/aggregates/lookups';
import type { Id } from '@/domain/schema/types';
import { membersByStatement, statementSummary } from '@/domain/statements/reconcile';
import { useFormat } from '@/hooks/useFormat';
import { useDocStore } from '@/store/docStore';
import { NewStatementDialog } from './NewStatementDialog';
import styles from './StatementsList.module.scss';

/** Statement history: what each statement period charged, credited and ended at. */
export function StatementsList() {
  const statements = useDocStore((s) => s.doc?.statements);
  const accounts = useDocStore((s) => s.doc?.accounts);
  const transactions = useDocStore((s) => s.doc?.transactions);
  const [accountId, setAccountId] = useState<Id | null>(null);
  const [creating, setCreating] = useState(false);
  const format = useFormat();

  const rows = useMemo(() => {
    if (!statements || !transactions) return [];
    const members = membersByStatement({ transactions });
    return Object.values(statements)
      .filter((st) => !accountId || st.accountId === accountId)
      .sort((a, b) => (a.endDate < b.endDate ? 1 : a.endDate > b.endDate ? -1 : 0))
      .map((st) => ({ statement: st, summary: statementSummary(st, members.get(st.id) ?? []) }));
  }, [statements, transactions, accountId]);

  if (!accounts) return null;
  const accountOptions = sortedAccounts({ accounts }).map((a) => ({ value: a.id, label: a.name }));

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <Select
          size="xs"
          placeholder="All accounts"
          aria-label="Account"
          data={accountOptions}
          value={accountId}
          onChange={setAccountId}
          clearable
          w={220}
        />
        <Button
          leftSection={<IconPlus size={14} />}
          onClick={() => {
            setCreating(true);
          }}
        >
          New statement
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className={styles.empty}>
          No statements yet. Add one from a bank or card statement to check that your transactions
          match it.
        </p>
      ) : (
        <div className={styles.table} role="table" aria-label="Statements">
          <div className={clsx(styles.row, styles.head)} role="row">
            <span>Account</span>
            <span>Period</span>
            <span className={styles.num}>Opening</span>
            <span className={styles.num}>Charges</span>
            <span className={styles.num}>Credits</span>
            <span className={styles.num}>Closing</span>
            <span>Status</span>
          </div>
          {rows.map(({ statement: st, summary }) => (
            <Link key={st.id} href={`/statements/${st.id}`} className={styles.row} role="row">
              <span className={styles.account}>{accounts[st.accountId]?.name ?? 'Unknown'}</span>
              <span className={styles.period}>
                {format.date(st.startDate)} – {format.date(st.endDate)}
              </span>
              <span className={clsx(styles.num, styles.dim)}>
                {format.money(st.openingBalance)}
              </span>
              <span className={styles.num}>{format.money(summary.charges)}</span>
              <span className={styles.num}>{format.money(summary.credits)}</span>
              <span className={clsx(styles.num, styles.strong)}>
                {format.money(st.closingBalance)}
              </span>
              <span>
                {st.status === 'reconciled' ? (
                  <Badge size="xs" variant="light" color="green">
                    Reconciled
                  </Badge>
                ) : summary.difference === 0 ? (
                  <Badge size="xs" variant="light">
                    Ready to finish
                  </Badge>
                ) : (
                  <Badge size="xs" variant="light" color="yellow">
                    {format.money(summary.difference)} to find
                  </Badge>
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
      <NewStatementDialog
        opened={creating}
        defaultAccountId={accountId}
        onClose={() => {
          setCreating(false);
        }}
      />
    </div>
  );
}

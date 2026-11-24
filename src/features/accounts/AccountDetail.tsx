import { ActionIcon, Anchor, Button, Tooltip } from '@mantine/core';
import { IconArrowLeft, IconListDetails, IconRefresh, IconTrash } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { presetRange } from '@/domain/aggregates/sampling';
import { today } from '@/lib/date';
import type { Id } from '@/domain/schema/types';
import { ACCOUNT_TYPE_LABELS } from '@/features/settings/accountTypes';
import { useFormat } from '@/hooks/useFormat';
import { toastWithUndo, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { INVESTMENT_TYPES } from './accountGroups';
import { RangeControl } from './RangeControl';
import { filterRegisterToAccount } from './showTransactions';
import { StatTile } from './StatTile';
import { UpdateBalanceDialog } from './UpdateBalanceDialog';
import { useAccountDetail } from './useAccountDetail';
import styles from './AccountDetail.module.scss';

export function AccountDetail({ id }: { id: Id }) {
  const account = useDocStore((s) => s.doc?.accounts[id]);
  const [range, setRange] = useState(() => presetRange('1y', today()));
  const [updating, setUpdating] = useState(false);
  const view = useAccountDetail(id, range);
  const format = useFormat();
  const [, navigate] = useLocation();

  if (!account) {
    return (
      <p className={styles.root}>
        This account doesn’t exist.{' '}
        <Anchor component={Link} href="/accounts">
          Back to accounts
        </Anchor>
      </p>
    );
  }
  if (!view) return null;

  const investment = INVESTMENT_TYPES.has(account.type);
  const anchors = [...view.ledger.anchors].reverse();

  return (
    <div className={styles.root}>
      <Link href="/accounts" className={styles.back}>
        <IconArrowLeft size={14} /> Accounts
      </Link>
      <header className={styles.header}>
        <div>
          <h2 className={styles.name}>{account.name}</h2>
          <p className={styles.meta}>
            {ACCOUNT_TYPE_LABELS[account.type]}
            {account.institution && ` · ${account.institution}`}
            {account.closed && ' · Closed'}
          </p>
        </div>
        <div className={styles.actions}>
          <Button
            variant="default"
            leftSection={<IconListDetails size={14} />}
            onClick={() => {
              filterRegisterToAccount(account);
              navigate('/transactions');
            }}
          >
            Transactions
          </Button>
          <Button
            leftSection={<IconRefresh size={14} />}
            onClick={() => {
              setUpdating(true);
            }}
          >
            Update balance
          </Button>
        </div>
      </header>

      <div className={styles.summary}>
        <StatTile primary label="Balance today" value={format.money(view.balance)} />
        <RangeControl value={range} onChange={setRange} />
      </div>
      <TimeSeriesChart
        label={`${account.name} balance`}
        dates={view.dates}
        values={view.values}
        height={180}
        formatValue={(c) => format.money(c)}
        formatAxis={format.moneyCompact}
        formatDate={format.date}
      />

      <h3 className={styles.heading}>Balance history</h3>
      {anchors.length === 0 ? (
        <p className={styles.empty}>
          No balance updates yet. The balance is calculated from transactions alone. Use “Update
          balance” to record the real balance from a statement or website
          {investment ? '; differences are tracked as market change' : ''}.
        </p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th className={styles.num}>Balance</th>
              <th className={styles.num}>From transactions</th>
              <th className={styles.num}>{investment ? 'Market change' : 'Adjustment'}</th>
              <th>Note</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {anchors.map((a, i) => {
              const opening = i === anchors.length - 1;
              return (
                <tr key={a.snapshot.id}>
                  <td>{format.date(a.snapshot.date)}</td>
                  <td className={clsx(styles.num, styles.strong)}>
                    {format.money(a.snapshot.balance)}
                  </td>
                  <td className={clsx(styles.num, styles.dim)}>
                    {opening ? '—' : format.money(a.implied)}
                  </td>
                  <td
                    className={clsx(
                      styles.num,
                      opening || a.adjustment === 0
                        ? styles.dim
                        : a.adjustment > 0
                          ? styles.up
                          : styles.down,
                    )}
                  >
                    {opening
                      ? 'Opening balance'
                      : a.adjustment === 0
                        ? '—'
                        : format.money(a.adjustment, { sign: 'always' })}
                  </td>
                  <td className={styles.note}>{a.snapshot.note}</td>
                  <td className={styles.actionsCell}>
                    <Tooltip label="Delete this balance">
                      <ActionIcon
                        color="gray"
                        aria-label={`Delete balance on ${a.snapshot.date}`}
                        onClick={() => {
                          if (tryRun('deleteSnapshot', { id: a.snapshot.id }))
                            toastWithUndo('Deleted balance update');
                        }}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <UpdateBalanceDialog
        account={updating ? account : null}
        onClose={() => {
          setUpdating(false);
        }}
      />
    </div>
  );
}

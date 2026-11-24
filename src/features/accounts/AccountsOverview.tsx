import { Switch } from '@mantine/core';
import { clsx } from 'clsx';
import { useState } from 'react';
import { Link } from 'wouter';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { Sparkline } from '@/components/charts/Sparkline';
import { presetRange } from '@/domain/aggregates/sampling';
import { today } from '@/lib/date';
import { useFormat } from '@/hooks/useFormat';
import { ACCOUNT_GROUPS } from './accountGroups';
import { RangeControl } from './RangeControl';
import { rangeLabel } from './rangeLabel';
import { StatTile } from './StatTile';
import { useAccountBalances, type AccountSummary } from './useAccountBalances';
import styles from './AccountsOverview.module.scss';

/** Net worth over time, then every account grouped as assets and liabilities. */
export function AccountsOverview() {
  const [range, setRange] = useState(() => presetRange('1y', today()));
  const [showClosed, setShowClosed] = useState(false);
  const view = useAccountBalances(range);
  const format = useFormat();
  if (!view) return null;

  const change = view.rangeChange;
  const label = rangeLabel(range, format.date);
  const visible = view.accounts.filter((a) => showClosed || !a.account.closed);
  const closedCount = view.accounts.filter((a) => a.account.closed).length;

  return (
    <div className={styles.root}>
      <section className={styles.summary}>
        <div className={styles.tiles}>
          <StatTile
            primary
            label="Net worth"
            value={format.money(view.current.net)}
            delta={{
              text: `${format.money(change, { sign: 'always' })} ${label}`,
              positive: change >= 0,
            }}
          />
          <StatTile label="Assets" value={format.money(view.current.assets)} />
          <StatTile label="Liabilities" value={format.money(view.current.liabilities)} />
        </div>
        <RangeControl value={range} onChange={setRange} />
      </section>
      <div className={styles.chart}>
        <TimeSeriesChart
          label={`Net worth ${label}`}
          dates={view.series.map((p) => p.date)}
          values={view.series.map((p) => p.net)}
          height={200}
          formatValue={(c) => format.money(c)}
          formatAxis={format.moneyCompact}
          formatDate={format.date}
        />
      </div>

      <div className={styles.listHeader}>
        <h2 className={styles.heading}>Accounts</h2>
        {closedCount > 0 && (
          <Switch
            size="xs"
            label={`Show closed (${closedCount})`}
            checked={showClosed}
            onChange={(e) => {
              setShowClosed(e.currentTarget.checked);
            }}
          />
        )}
      </div>
      <div className={styles.table} role="table" aria-label="Accounts">
        <div className={clsx(styles.row, styles.head)} role="row">
          <span role="columnheader">Account</span>
          <span role="columnheader" className={styles.hideNarrow}>
            Last 3 months
          </span>
          <span role="columnheader" className={styles.num}>
            30-day change
          </span>
          <span role="columnheader" className={styles.num}>
            Balance
          </span>
        </div>
        {ACCOUNT_GROUPS.map((group) => {
          const rows = visible.filter((a) => group.types.includes(a.account.type));
          if (rows.length === 0) return null;
          const total = rows.reduce((s, r) => s + r.balance, 0);
          return (
            <div key={group.id} role="rowgroup">
              <div className={clsx(styles.row, styles.group)} role="row">
                <span role="cell">{group.title}</span>
                <span role="cell" className={styles.hideNarrow} />
                <span role="cell" />
                <span role="cell" className={styles.num}>
                  {format.money(total)}
                </span>
              </div>
              {rows.map((r) => (
                <AccountRow key={r.account.id} summary={r} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AccountRow({ summary }: { summary: AccountSummary }) {
  const format = useFormat();
  const { account, balance, change30, trend } = summary;
  return (
    <Link
      href={`/accounts/${account.id}`}
      className={clsx(styles.row, styles.account, account.closed && styles.closed)}
      role="row"
    >
      <span role="cell" className={styles.name}>
        <span className={styles.accountName}>{account.name}</span>
        {account.institution && <span className={styles.institution}>{account.institution}</span>}
      </span>
      <span role="cell" className={styles.hideNarrow}>
        <Sparkline values={trend} label={`${account.name} balance trend`} />
      </span>
      <span
        role="cell"
        className={clsx(
          styles.num,
          change30 > 0 ? styles.up : change30 < 0 ? styles.down : styles.dim,
        )}
      >
        {change30 === 0 ? '—' : format.money(change30, { sign: 'always' })}
      </span>
      <span role="cell" className={clsx(styles.num, styles.balance)}>
        {format.money(balance)}
      </span>
    </Link>
  );
}

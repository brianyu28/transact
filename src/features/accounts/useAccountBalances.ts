import { useMemo } from 'react';
import {
  adjustmentsBetween,
  balanceAtEnd,
  firstDataDate,
  getLedger,
  netWorthSeries,
  type NetWorthPoint,
} from '@/domain/aggregates/balances';
import { sortedAccounts } from '@/domain/aggregates/lookups';
import { sampleDates, type RangeSelection } from '@/domain/aggregates/sampling';
import type { Account, BalanceSnapshot, Cents, ISODate } from '@/domain/schema/types';
import { addDays, today as todayDate } from '@/lib/date';
import { useDocStore } from '@/store/docStore';

export interface AccountSummary {
  account: Account;
  balance: Cents;
  /** Change over the last 30 days. */
  change30: Cents;
  /** Weekly balances over the last ~3 months (for a sparkline). */
  trend: Cents[];
  lastSnapshot: BalanceSnapshot | undefined;
  /** Market change / discrepancies recorded by snapshots in the last 30 days. */
  adjustments30: Cents;
}

export interface BalancesView {
  today: ISODate;
  series: NetWorthPoint[];
  /** Net worth today (independent of the selected range). */
  current: NetWorthPoint;
  /** Change in net worth from the first to the last point of the range. */
  rangeChange: Cents;
  accounts: AccountSummary[];
}

/** Balances for the Accounts screen, recomputed only when transactions or snapshots change. */
export function useAccountBalances(range: RangeSelection): BalancesView | null {
  const index = useDocStore((s) => s.index);
  const indexVersion = useDocStore((s) => s.indexVersion);
  const accounts = useDocStore((s) => s.doc?.accounts);
  const snapshots = useDocStore((s) => s.doc?.balanceSnapshots);

  return useMemo(() => {
    if (!index || !accounts || !snapshots) return null;
    const model = { accounts, balanceSnapshots: snapshots };
    const today = todayDate();
    const dates = sampleDates(range, today, firstDataDate(model, index));
    const series = netWorthSeries(model, index, dates);
    const [current] = netWorthSeries(model, index, [today]);
    if (!current) return null;
    const rangeChange = (series.at(-1)?.net ?? 0) - (series[0]?.net ?? 0);
    const monthAgo = addDays(today, -30);
    const trendDates = Array.from({ length: 14 }, (_, i) => addDays(today, (i - 13) * 7));

    const summaries = sortedAccounts({ accounts }).map((account): AccountSummary => {
      const ledger = getLedger(model, index, account.id);
      const balance = balanceAtEnd(ledger, today);
      return {
        account,
        balance,
        change30: balance - balanceAtEnd(ledger, monthAgo),
        trend: trendDates.map((d) => balanceAtEnd(ledger, d)),
        lastSnapshot: ledger.anchors.at(-1)?.snapshot,
        adjustments30: adjustmentsBetween(ledger, monthAgo, today),
      };
    });
    return { today, series, current, rangeChange, accounts: summaries };
    // indexVersion: transactions changed (the index is mutated in place).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, indexVersion, accounts, snapshots, range]);
}

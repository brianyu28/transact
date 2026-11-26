import { useMemo } from 'react';
import {
  balanceAtEnd,
  firstDataDate,
  getLedger,
  netWorthSeries,
  type NetWorthPoint,
} from '@/domain/aggregates/balances';
import { sortedAccounts } from '@/domain/aggregates/lookups';
import { sampleDates, type RangeSelection } from '@/domain/aggregates/sampling';
import type { Account, BalanceSnapshot, Cents, ISODate } from '@/domain/schema/types';
import { today as todayDate } from '@/lib/date';
import { useDocStore } from '@/store/docStore';

export interface AccountSummary {
  account: Account;
  balance: Cents;
  /** Change in balance over the selected range. */
  change: Cents;
  /** Balances across the selected range (for a sparkline). */
  trend: Cents[];
  lastSnapshot: BalanceSnapshot | undefined;
}

/** Sparklines are 80px wide: more points than this add nothing. */
const TREND_POINTS = 40;

/** Up to `max` dates spread evenly over `dates`, always keeping the first and last. */
function thin(dates: readonly ISODate[], max: number): ISODate[] {
  if (dates.length <= max) return [...dates];
  const step = (dates.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => dates[Math.round(i * step)] as ISODate);
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
    const trendDates = thin(dates, TREND_POINTS);
    const start = dates[0] ?? today;
    const end = dates.at(-1) ?? today;

    const summaries = sortedAccounts({ accounts }).map((account): AccountSummary => {
      const ledger = getLedger(model, index, account.id);
      const balance = balanceAtEnd(ledger, today);
      return {
        account,
        balance,
        change: balanceAtEnd(ledger, end) - balanceAtEnd(ledger, start),
        trend: trendDates.map((d) => balanceAtEnd(ledger, d)),
        lastSnapshot: ledger.anchors.at(-1)?.snapshot,
      };
    });
    return { today, series, current, rangeChange, accounts: summaries };
    // indexVersion: transactions changed (the index is mutated in place).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, indexVersion, accounts, snapshots, range]);
}

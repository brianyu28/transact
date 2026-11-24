import { useMemo } from 'react';
import { balanceAtEnd, getLedger, type AccountLedger } from '@/domain/aggregates/balances';
import { sampleDates, type RangeSelection } from '@/domain/aggregates/sampling';
import type { Cents, ISODate, Id } from '@/domain/schema/types';
import { today as todayDate } from '@/lib/date';
import { useDocStore } from '@/store/docStore';

export interface AccountDetailView {
  ledger: AccountLedger;
  today: ISODate;
  balance: Cents;
  dates: ISODate[];
  values: Cents[];
}

export function useAccountDetail(accountId: Id, range: RangeSelection): AccountDetailView | null {
  const index = useDocStore((s) => s.index);
  const indexVersion = useDocStore((s) => s.indexVersion);
  const snapshots = useDocStore((s) => s.doc?.balanceSnapshots);
  return useMemo(() => {
    if (!index || !snapshots) return null;
    const ledger = getLedger({ balanceSnapshots: snapshots }, index, accountId);
    const today = todayDate();
    const dates = sampleDates(range, today, ledger.firstDate);
    return {
      ledger,
      today,
      balance: balanceAtEnd(ledger, today),
      dates,
      values: dates.map((d) => balanceAtEnd(ledger, d)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indexVersion tracks in-place index changes.
  }, [index, indexVersion, snapshots, accountId, range]);
}

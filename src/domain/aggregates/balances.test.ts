import { describe, expect, it } from 'vitest';
import type { BalanceSnapshot } from '../schema/types';
import { balanceAtEnd, balanceAtStart, buildLedger } from './balances';

const snap = (date: string, balance: number, id = date): BalanceSnapshot => ({
  id: `snp_${id.replace(/-/g, '')}`,
  accountId: 'acc_aaaaaaaaaaaa',
  date,
  balance,
  source: 'manual',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const deltas = new Map([
  ['2026-01-05', -1000],
  ['2026-01-10', 5000],
  ['2026-02-01', -2000],
]);

describe('balance ledger', () => {
  it('sums transactions when there are no snapshots', () => {
    const l = buildLedger('acc_aaaaaaaaaaaa', deltas, []);
    expect(balanceAtStart(l, '2026-01-05')).toBe(0);
    expect(balanceAtEnd(l, '2026-01-05')).toBe(-1000);
    expect(balanceAtEnd(l, '2026-12-31')).toBe(2000);
  });

  it('anchors on snapshots taken at the start of a day', () => {
    const l = buildLedger('acc_aaaaaaaaaaaa', deltas, [snap('2026-01-10', 100000)]);
    // Before the snapshot, balances are derived backwards from it.
    expect(balanceAtStart(l, '2026-01-05')).toBe(101000);
    expect(balanceAtStart(l, '2026-01-10')).toBe(100000);
    expect(balanceAtEnd(l, '2026-01-10')).toBe(105000);
    expect(balanceAtEnd(l, '2026-02-01')).toBe(103000);
  });

  it('reports adjustments between snapshots', () => {
    const l = buildLedger('acc_aaaaaaaaaaaa', deltas, [
      snap('2026-01-01', 10000),
      snap('2026-03-01', 15000),
    ]);
    // 10000 + (-1000 + 5000 - 2000) = 12000 implied, snapshot says 15000.
    expect(l.anchors[1]).toMatchObject({ implied: 12000, adjustment: 3000 });
    expect(balanceAtStart(l, '2026-02-28')).toBe(12000);
    // The end of Feb 28 is the start of Mar 1, which the snapshot defines.
    expect(balanceAtEnd(l, '2026-02-28')).toBe(15000);
    expect(l.anchors[0]?.adjustment).toBe(0);
  });
});

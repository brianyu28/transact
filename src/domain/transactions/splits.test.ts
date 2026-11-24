import { describe, expect, it } from 'vitest';
import type { Transaction } from '../schema/types';
import { effectiveSplits } from './splits';

const base: Transaction = {
  id: 'txn_aaaaaaaaaaaa',
  accountId: 'acc_aaaaaaaaaaaa',
  date: '2026-11-01',
  payee: 'Store',
  amount: -10000,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

describe('effectiveSplits', () => {
  it('returns one virtual split for an unsplit transaction', () => {
    const t: Transaction = { ...base, categoryId: 'cat_food00000000', tags: ['tag_trip00000000'] };
    expect(effectiveSplits(t)).toEqual([
      {
        id: t.id,
        amount: -10000,
        categoryId: 'cat_food00000000',
        tags: ['tag_trip00000000'],
        excluded: false,
      },
    ]);
  });

  it('merges transaction tags and exclusion into each split', () => {
    const t: Transaction = {
      ...base,
      tags: ['tag_trip00000000'],
      splits: [
        { id: 'spl_a00000000000', amount: -6000, categoryId: 'cat_food00000000' },
        {
          id: 'spl_b00000000000',
          amount: -4000,
          tags: ['tag_gift00000000', 'tag_trip00000000'],
          excluded: true,
        },
      ],
    };
    const [a, b] = effectiveSplits(t);
    expect(a).toMatchObject({ amount: -6000, tags: ['tag_trip00000000'], excluded: false });
    expect(b).toMatchObject({
      amount: -4000,
      tags: ['tag_trip00000000', 'tag_gift00000000'],
      excluded: true,
    });
  });

  it('caches by object identity', () => {
    const t: Transaction = { ...base };
    expect(effectiveSplits(t)).toBe(effectiveSplits(t));
  });
});

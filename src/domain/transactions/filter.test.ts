import { describe, expect, it } from 'vitest';
import { DocIndex } from '../aggregates/docIndex';
import { generateDemoDocument } from '../demo/generate';
import { iterateTransactions } from '../model';
import { compileFilter, parseQuery } from './filter';
import { runFilter } from './query';

const doc = generateDemoDocument({ endDate: '2026-06-30', years: 1, appVersion: 't', seed: 5 });
const index = DocIndex.build(doc);
const all = [...iterateTransactions(doc)];
const TODAY = '2026-06-30';

const query = (q: string) => {
  const filter = compileFilter(q, doc, TODAY);
  const ids = runFilter(doc, index, filter);
  return { filter, ids, txns: ids.map((id) => all.find((t) => t.id === id)!) };
};

describe('parseQuery', () => {
  it('recognizes keys, negation, quotes, dates and amounts', () => {
    expect(parseQuery('acct:"Rewards Card" -tag:reimbursable 2026-03..2026-04 >50 coffee')).toEqual(
      [
        { raw: 'acct:"Rewards Card"', kind: 'account', value: 'Rewards Card', negated: false },
        { raw: '-tag:reimbursable', kind: 'tag', value: 'reimbursable', negated: true },
        { raw: '2026-03..2026-04', kind: 'date', value: '2026-03..2026-04', negated: false },
        { raw: '>50', kind: 'amount', value: '>50', negated: false },
        { raw: 'coffee', kind: 'text', value: 'coffee', negated: false },
      ],
    );
  });
});

describe('compileFilter / runFilter', () => {
  it('returns everything, newest first, for an empty query', () => {
    const { ids, txns } = query('');
    expect(ids).toHaveLength(all.length);
    expect(txns[0]!.date >= txns.at(-1)!.date).toBe(true);
  });

  it('filters by account using the index', () => {
    const { filter, txns } = query('acct:rewards');
    expect(filter.accountIds?.size).toBe(1);
    expect(txns.length).toBeGreaterThan(0);
    expect(new Set(txns.map((t) => doc.accounts[t.accountId]!.name))).toEqual(
      new Set(['Rewards Card']),
    );
  });

  it('matches categories including subcategories', () => {
    const food = query('cat:food').txns;
    const names = new Set(
      food.map((t) => doc.categories[t.categoryId ?? t.splits![0]!.categoryId!]?.name),
    );
    expect(names.has('Groceries')).toBe(true);
    expect(names.has('Restaurants')).toBe(true);
  });

  it('combines date ranges, amounts, negation and flags', () => {
    const { txns } = query('2026-03 >100 -is:transfer');
    expect(txns.length).toBeGreaterThan(0);
    for (const t of txns) {
      expect(t.date.startsWith('2026-03')).toBe(true);
      expect(Math.abs(t.amount)).toBeGreaterThan(10000);
      expect(t.transfer).toBeUndefined();
    }
  });

  it('supports relative dates', () => {
    for (const t of query('date:last-month').txns) expect(t.date.startsWith('2026-05')).toBe(true);
  });

  it('reports terms it cannot resolve and matches nothing for them', () => {
    const { filter, ids } = query('tag:does-not-exist');
    expect(filter.problems).toHaveLength(1);
    expect(ids).toEqual([]);
  });

  it('matches split tags and excluded splits', () => {
    for (const t of query('tag:reimbursable').txns) expect(t.splits).toBeDefined();
    expect(query('is:excluded').ids.length).toBe(query('tag:reimbursable').ids.length);
  });
});

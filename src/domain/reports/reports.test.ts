import { describe, expect, it } from 'vitest';
import { balanceAtEnd, getLedger } from '../aggregates/balances';
import { DocIndex } from '../aggregates/docIndex';
import { categoryTree } from '../aggregates/lookups';
import { generateDemoDocument } from '../demo/generate';
import {
  OTHER,
  budgetHistory,
  categoryBreakdown,
  incomeVsSpending,
  monthsBetween,
  netWorthChanges,
  previousSpan,
  reportPeriod,
  spendingByCategory,
} from './reports';
import { iterateTransactions } from '../model';
import { effectiveSplits } from '../transactions/splits';

const TODAY = '2026-06-30';
const doc = generateDemoDocument({ endDate: TODAY, years: 2, appVersion: 't', seed: 11 });
const index = DocIndex.build(doc);
const months = monthsBetween('2025-07', '2026-06');
const year = reportPeriod('2025-07-01', '2026-06-30');
const columns = year.columns;

describe('reports', () => {
  it('lists months inclusively', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('spending by category adds up to total spending, folding small categories into Other', () => {
    const { series, totals } = spendingByCategory(doc, index, columns, null, 4);
    expect(series.length).toBeLessThanOrEqual(5);
    expect(series.at(-1)?.key).toBe(OTHER);
    const spending = incomeVsSpending(doc, index, columns).map((m) => m.spending);
    expect(totals).toEqual(spending);
    columns.forEach((_, i) => {
      expect(series.reduce((s, x) => s + (x.values[i] ?? 0), 0)).toBe(totals[i]);
    });
  });

  it('drills into a parent category, including its own direct spending', () => {
    const food = categoryTree(doc.categories).nodes.find((n) => n.category.name === 'Food')!
      .category.id;
    const top = categoryBreakdown(doc, index, year).rows.find((r) => r.key === food)!;
    const children = categoryBreakdown(doc, index, year, food);
    expect(children.total).toBe(top.total);
    expect(children.rows.map((r) => r.label)).toEqual(
      expect.arrayContaining(['Groceries', 'Restaurants', 'Coffee']),
    );
    expect(top.hasChildren).toBe(true);
  });

  it('reports income and spending per month', () => {
    const rows = incomeVsSpending(doc, index, columns);
    for (const r of rows) {
      expect(r.income).toBeGreaterThan(0);
      expect(r.net).toBe(r.income - r.spending);
    }
  });

  it('counts excluded splits only when asked', () => {
    const without = incomeVsSpending(doc, index, columns);
    const withExcluded = incomeVsSpending(doc, index, columns, { includeExcluded: true });
    const total = (rows: typeof without) => rows.reduce((s, r) => s + r.spending, 0);
    // The demo data excludes others' share of group purchases, which is spending.
    expect(total(withExcluded)).toBeGreaterThan(total(without));
  });

  it('splits net worth change into saved and market change that add up', () => {
    const rows = netWorthChanges(doc, index, columns, TODAY);
    for (let i = 1; i < rows.length; i++) expect(rows[i]?.start).toBe(rows[i - 1]?.end);
    for (const r of rows) expect(r.saved + r.market).toBe(r.change);
    // Investment accounts get monthly balance updates, so market change shows up.
    expect(rows.some((r) => r.market !== 0)).toBe(true);
    const total = Object.values(doc.accounts).reduce(
      (s, a) => s + balanceAtEnd(getLedger(doc, index, a.id), TODAY),
      0,
    );
    expect(rows.at(-1)?.end).toBe(total);
  });

  it('builds a budget history grid', () => {
    const history = budgetHistory(doc, index, months, TODAY);
    expect(history.lines.length).toBeGreaterThan(0);
    for (const line of history.lines) expect(line.cells).toHaveLength(months.length);
    expect(history.totals).toHaveLength(months.length);
  });

  it('splits a span into days when short and clipped months when long', () => {
    const short = reportPeriod('2026-03-25', '2026-04-07');
    expect(short.unit).toBe('day');
    expect(short.columns).toHaveLength(14);
    expect(short.months).toEqual(['2026-03', '2026-04']);
    const long = reportPeriod('2026-01-15', '2026-03-10');
    expect(long.unit).toBe('month');
    expect(long.columns.map((c) => [c.from, c.to])).toEqual([
      ['2026-01-15', '2026-01-31'],
      ['2026-02-01', '2026-02-28'],
      ['2026-03-01', '2026-03-10'],
    ]);
  });

  it('compares with the previous whole months, or the previous days', () => {
    expect(previousSpan({ from: '2026-01-01', to: '2026-03-31' })).toEqual({
      from: '2025-10-01',
      to: '2025-12-31',
    });
    expect(previousSpan({ from: '2026-03-10', to: '2026-03-16' })).toEqual({
      from: '2026-03-03',
      to: '2026-03-09',
    });
  });

  it('counts only transactions inside a partial span', () => {
    const span = { from: '2026-03-10', to: '2026-03-16' };
    const tree = categoryTree(doc.categories);
    let expected = 0;
    for (const t of iterateTransactions(doc)) {
      if (t.transfer || t.date < span.from || t.date > span.to) continue;
      for (const s of effectiveSplits(t)) {
        if (!s.excluded && s.categoryId && tree.byId.get(s.categoryId)?.kind === 'expense')
          expected -= s.amount;
      }
    }
    expect(expected).toBeGreaterThan(0);
    expect(categoryBreakdown(doc, index, span).total).toBe(expected);
    // Day columns add up to the same total.
    const daily = spendingByCategory(doc, index, reportPeriod(span.from, span.to).columns);
    expect(daily.totals.reduce((a, b) => a + b, 0)).toBe(expected);
  });
});

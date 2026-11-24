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
  spendingByCategory,
} from './reports';

const TODAY = '2026-06-30';
const doc = generateDemoDocument({ endDate: TODAY, years: 2, appVersion: 't', seed: 11 });
const index = DocIndex.build(doc);
const months = monthsBetween('2025-07', '2026-06');

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
    const { series, totals } = spendingByCategory(doc, index, months, null, 4);
    expect(series.length).toBeLessThanOrEqual(5);
    expect(series.at(-1)?.key).toBe(OTHER);
    const spending = incomeVsSpending(doc, index, months).map((m) => m.spending);
    expect(totals).toEqual(spending);
    months.forEach((_, i) => {
      expect(series.reduce((s, x) => s + (x.values[i] ?? 0), 0)).toBe(totals[i]);
    });
  });

  it('drills into a parent category, including its own direct spending', () => {
    const food = categoryTree(doc.categories).nodes.find((n) => n.category.name === 'Food')!
      .category.id;
    const top = categoryBreakdown(doc, index, months).rows.find((r) => r.key === food)!;
    const children = categoryBreakdown(doc, index, months, food);
    expect(children.total).toBe(top.total);
    expect(children.rows.map((r) => r.label)).toEqual(
      expect.arrayContaining(['Groceries', 'Restaurants', 'Coffee']),
    );
    expect(top.hasChildren).toBe(true);
  });

  it('reports income and spending per month', () => {
    const rows = incomeVsSpending(doc, index, months);
    for (const r of rows) {
      expect(r.income).toBeGreaterThan(0);
      expect(r.net).toBe(r.income - r.spending);
    }
  });

  it('splits net worth change into saved and market change that add up', () => {
    const rows = netWorthChanges(doc, index, months, TODAY);
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
});

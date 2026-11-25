import { beforeEach, describe, expect, it } from 'vitest';
import { budgetView, customBudgetViews, rolloverSuggestions } from '@/domain/budgets/views';
import { getTransaction } from '@/domain/model';
import { compileFilter } from '@/domain/transactions/filter';
import { runFilter } from '@/domain/transactions/query';
import { testDocument } from '@/test/documents';
import { createDocStore } from './docStore';

let store: ReturnType<typeof createDocStore>;
const s = () => store.getState();
const d = () => s().dispatch;
const doc = () => s().doc!;
const cat = (name: string) => Object.values(doc().categories).find((c) => c.name === name)!.id;
let card: string;

const spend = (date: string, dollars: number, category: string, tags: string[] = []) =>
  d()('saveTransaction', {
    accountId: card,
    date,
    payee: 'Shop',
    amount: -dollars * 100,
    categoryId: cat(category),
    transferAccountId: null,
    tagNames: tags,
    note: '',
  });

const view = (cadence: 'monthly' | 'annual', key: string) =>
  budgetView(doc(), s().index!, cadence, key, '2026-03-15');

beforeEach(() => {
  store = createDocStore();
  store.getState().load(testDocument());
  card = d()('createAccount', { name: 'Card', type: 'credit' });
});

describe('budgets end to end', () => {
  it('rolls over unspent money into the next month, keeping defaults intact', () => {
    const food = d()('createTemplateLine', {
      cadence: 'monthly',
      target: { kind: 'categories', categoryIds: [cat('Food')] },
      defaultAmount: 50000,
    });
    d()('createPeriod', {
      cadence: 'monthly',
      period: '2026-01',
      lines: [{ templateLineId: food, base: 50000, rollover: 0 }],
    });
    spend('2026-01-10', 376, 'Groceries'); // $124 under budget

    const feb = rolloverSuggestions(doc(), s().index!, 'monthly', '2026-02', '2026-03-15');
    expect(feb[0]).toMatchObject({
      defaultAmount: 50000,
      previousRemaining: 12400,
      suggested: 12400,
    });

    // The user chooses to roll over $100.
    d()('createPeriod', {
      cadence: 'monthly',
      period: '2026-02',
      lines: [{ templateLineId: food, base: 50000, rollover: 10000 }],
    });
    expect(view('monthly', '2026-02').lines[0]).toMatchObject({
      budgeted: 60000,
      spent: 0,
      remaining: 60000,
    });

    // March: defaults are unchanged; February's whole budget (incl. its rollover) carries.
    spend('2026-02-20', 550, 'Restaurants');
    const mar = rolloverSuggestions(doc(), s().index!, 'monthly', '2026-03', '2026-03-15');
    expect(mar[0]).toMatchObject({ defaultAmount: 50000, previousRemaining: 5000 });
  });

  it('suggests overspending as a negative rollover, and none when the policy says so', () => {
    const food = d()('createTemplateLine', {
      cadence: 'monthly',
      target: { kind: 'categories', categoryIds: [cat('Food')] },
      defaultAmount: 10000,
    });
    d()('createPeriod', {
      cadence: 'monthly',
      period: '2026-01',
      lines: [{ templateLineId: food, base: 10000, rollover: 0 }],
    });
    spend('2026-01-10', 180, 'Groceries');
    expect(
      rolloverSuggestions(doc(), s().index!, 'monthly', '2026-02', '2026-03-15')[0]?.suggested,
    ).toBe(-8000);
    d()('updateTemplateLine', { id: food, changes: { rolloverPolicy: 'none' } });
    expect(
      rolloverSuggestions(doc(), s().index!, 'monthly', '2026-02', '2026-03-15')[0]?.suggested,
    ).toBe(0);
  });

  it('keeps notes on default lines and period lines separate', () => {
    const food = d()('createTemplateLine', {
      cadence: 'monthly',
      target: { kind: 'categories', categoryIds: [cat('Food')] },
      defaultAmount: 50000,
    });
    d()('updateTemplateLine', { id: food, changes: { note: ' Family of four ' } });
    expect(doc().budgets.template.lines[food]!.note).toBe('Family of four');

    const period = d()('createPeriod', {
      cadence: 'monthly',
      period: '2026-01',
      lines: [{ templateLineId: food, base: 50000, rollover: 0 }],
    });
    expect(doc().budgets.periods[period]!.lines[0]!.note).toBeUndefined();
    expect(view('monthly', '2026-01').lines[0]!.note).toBeUndefined();
    // Uncreated periods show the defaults, but not their notes.
    expect(view('monthly', '2026-02').lines[0]!.note).toBeUndefined();

    d()('setPeriodLine', { periodId: period, templateLineId: food, changes: { note: 'Party' } });
    expect(view('monthly', '2026-01').lines[0]!.note).toBe('Party');
    expect(doc().budgets.template.lines[food]!.note).toBe('Family of four');

    d()('updateTemplateLine', { id: food, changes: { note: '' } });
    expect(doc().budgets.template.lines[food]!.note).toBeUndefined();
  });

  it('keeps plans on default lines, period lines and custom lines, without copying them', () => {
    const insurance = d()('createTemplateLine', {
      cadence: 'annual',
      target: { kind: 'categories', categoryIds: [cat('Food')] },
      defaultAmount: 150000,
    });
    d()('updateTemplateLine', {
      id: insurance,
      changes: {
        plan: [
          { label: ' Car ', amount: 90000 },
          { label: '', amount: 0 },
          { label: 'Renters', amount: 20000 },
        ],
      },
    });
    expect(doc().budgets.template.lines[insurance]!.plan).toEqual([
      { label: 'Car', amount: 90000 },
      { label: 'Renters', amount: 20000 },
    ]);

    const period = d()('createPeriod', {
      cadence: 'annual',
      period: '2026',
      lines: [{ templateLineId: insurance, base: 150000, rollover: 0 }],
    });
    expect(view('annual', '2026').lines[0]!.plan).toBeUndefined();
    d()('setPeriodLine', {
      periodId: period,
      templateLineId: insurance,
      changes: { plan: [{ label: 'Disability', amount: 40000 }] },
    });
    expect(view('annual', '2026').lines[0]!.plan).toEqual([{ label: 'Disability', amount: 40000 }]);
    expect(doc().budgets.template.lines[insurance]!.plan).toHaveLength(2);

    d()('updateTemplateLine', { id: insurance, changes: { plan: [] } });
    expect('plan' in doc().budgets.template.lines[insurance]!).toBe(false);

    const trip = d()('createCustomBudget', {
      name: 'Trip',
      tagNames: ['trip'],
      mode: 'any',
      dateRange: null,
      lines: [
        {
          name: 'Total',
          target: { kind: 'everythingElse' },
          amount: 100000,
          plan: [{ label: 'Flights', amount: 60000 }],
        },
        { name: 'Food', target: { kind: 'categories', categoryIds: [cat('Food')] }, amount: 0 },
      ],
    });
    const lines = doc().budgets.custom[trip]!.lines;
    expect(lines[0]!.plan).toEqual([{ label: 'Flights', amount: 60000 }]);
    expect('plan' in lines[1]!).toBe(false);
  });

  it('adds, edits and removes lines in one period without touching the defaults', () => {
    const food = d()('createTemplateLine', {
      cadence: 'monthly',
      target: { kind: 'categories', categoryIds: [cat('Food')] },
      defaultAmount: 50000,
    });
    const period = d()('createPeriod', {
      cadence: 'monthly',
      period: '2026-01',
      lines: [{ templateLineId: food, base: 50000, rollover: 0 }],
    });
    const extra = d()('addPeriodLine', {
      periodId: period,
      target: { kind: 'everythingElse' },
      base: 10000,
      name: ' Misc ',
    });
    expect(() =>
      d()('addPeriodLine', { periodId: period, target: { kind: 'everythingElse' }, base: 0 }),
    ).toThrow(/already/);
    spend('2026-01-10', 30, 'Groceries');
    expect(view('monthly', '2026-01').lines.map((l) => [l.label, l.budgeted, l.spent])).toEqual([
      ['Food', 50000, 3000],
      ['Misc', 10000, 0],
    ]);
    expect(Object.keys(doc().budgets.template.lines)).toEqual([food]);

    d()('setPeriodLine', {
      periodId: period,
      templateLineId: food,
      changes: {
        name: 'Groceries only',
        target: { kind: 'categories', categoryIds: [cat('Groceries')] },
      },
    });
    expect(view('monthly', '2026-01').lines[0]).toMatchObject({
      label: 'Groceries only',
      spent: 3000,
    });
    expect(doc().budgets.template.lines[food]!.target).toEqual({
      kind: 'categories',
      categoryIds: [cat('Food')],
    });

    d()('removePeriodLine', { periodId: period, templateLineId: extra });
    expect(view('monthly', '2026-01').lines).toHaveLength(1);
  });

  it('shows defaults provisionally for periods that were not created', () => {
    d()('createTemplateLine', {
      cadence: 'monthly',
      target: { kind: 'categories', categoryIds: [cat('Food')] },
      defaultAmount: 30000,
    });
    spend('2026-03-02', 45, 'Coffee');
    const mar = view('monthly', '2026-03');
    expect(mar.period).toBeUndefined();
    expect(mar.lines[0]).toMatchObject({ label: 'Food', budgeted: 30000, spent: 4500 });
    expect(mar.elapsed).toBeCloseTo(15 / 31);
  });

  it('routes specific categories to their own line and the rest to Everything Else or unbudgeted', () => {
    d()('createTemplateLine', {
      cadence: 'monthly',
      target: { kind: 'categories', categoryIds: [cat('Bills')] },
      defaultAmount: 20000,
    });
    d()('createTemplateLine', {
      cadence: 'annual',
      target: { kind: 'categories', categoryIds: [cat('Insurance')] },
      defaultAmount: 150000,
    });
    spend('2026-03-01', 65, 'Cell Service');
    spend('2026-03-02', 1200, 'Insurance');
    spend('2026-03-03', 40, 'Entertainment');
    const mar = view('monthly', '2026-03');
    expect(mar.lines[0]?.spent).toBe(6500);
    expect(mar.unbudgeted).toBe(4000);
    expect(view('annual', '2026').lines[0]?.spent).toBe(120000);

    d()('createTemplateLine', {
      cadence: 'monthly',
      target: { kind: 'everythingElse' },
      defaultAmount: 10000,
    });
    expect(view('monthly', '2026-03').unbudgeted).toBe(0);
    expect(view('monthly', '2026-03').lines.find((l) => l.label === 'Everything Else')?.spent).toBe(
      4000,
    );
  });

  it('keeps tagged spending out of regular budgets and totals it per custom budget', () => {
    d()('createTemplateLine', {
      cadence: 'monthly',
      target: { kind: 'categories', categoryIds: [cat('Food')] },
      defaultAmount: 50000,
    });
    d()('createCustomBudget', {
      name: 'Vacation',
      tagNames: ['vacation-2026'],
      mode: 'any',
      dateRange: null,
      lines: [
        { name: 'Food', target: { kind: 'categories', categoryIds: [cat('Food')] }, amount: 40000 },
      ],
    });
    spend('2026-03-05', 60, 'Restaurants', ['vacation-2026']);
    spend('2026-03-05', 900, 'Lodging', ['vacation-2026']);
    spend('2026-03-06', 20, 'Restaurants');

    expect(view('monthly', '2026-03').lines[0]?.spent).toBe(2000);
    const [vacation] = customBudgetViews(doc(), s().index!, '2026-03-15');
    expect(vacation).toMatchObject({ total: 40000, spent: 96000 });
    expect(vacation?.lines).toEqual([
      expect.objectContaining({ label: 'Food', spent: 6000 }),
      expect.objectContaining({ label: 'Other', spent: 90000, amount: null }),
    ]);
  });

  it('refuses duplicate periods and a second Everything Else line', () => {
    const ee = d()('createTemplateLine', {
      cadence: 'monthly',
      target: { kind: 'everythingElse' },
      defaultAmount: 100,
    });
    expect(() =>
      d()('createTemplateLine', {
        cadence: 'monthly',
        target: { kind: 'everythingElse' },
        defaultAmount: 100,
      }),
    ).toThrow();
    d()('createPeriod', {
      cadence: 'monthly',
      period: '2026-03',
      lines: [{ templateLineId: ee, base: 100, rollover: 0 }],
    });
    expect(() =>
      d()('createPeriod', { cadence: 'monthly', period: '2026-03', lines: [] }),
    ).toThrow();
  });

  it('filters the register by budget, with the same precedence as the budgets', () => {
    d()('createTemplateLine', {
      cadence: 'monthly',
      target: { kind: 'categories', categoryIds: [cat('Food')] },
      defaultAmount: 1,
    });
    d()('createTemplateLine', {
      cadence: 'monthly',
      target: { kind: 'categories', categoryIds: [cat('Groceries')] },
      defaultAmount: 1,
    });
    d()('createCustomBudget', {
      name: 'Vacation',
      tagNames: ['vac'],
      mode: 'any',
      dateRange: null,
      lines: [],
    });
    spend('2026-03-01', 10, 'Restaurants');
    spend('2026-03-02', 20, 'Groceries');
    spend('2026-03-03', 30, 'Coffee', ['vac']);
    spend('2026-03-04', 40, 'Entertainment');
    const payees = (q: string) =>
      runFilter(doc(), s().index!, compileFilter(q, doc(), '2026-03-15')).map(
        (id) => getTransaction(doc(), id)!.amount / -100,
      );
    expect(payees('budget:food')).toEqual([10]); // groceries have their own line; coffee went to the custom budget
    expect(payees('budget:groceries')).toEqual([20]);
    expect(payees('budget:vacation')).toEqual([30]);
    expect(payees('budget:unbudgeted')).toEqual([40]);
  });
});

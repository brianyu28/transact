/**
 * Seeded generator for realistic, entirely synthetic demo data. Used for the in-app
 * demo, test fixtures and performance benchmarks, so no real data ever needs to enter
 * the repository. The same options always produce the same document.
 */
import { addDays, addMonths, dateParts, dayOfWeek, diffDays, type ISODate } from '@/lib/date';
import { ID_PREFIXES, type IdKind } from '@/lib/id';
import { putTransaction, type DocModel } from '../model';
import { createEmptyDocument, starterCategories, type CategoryTreeSpec } from '../schema/defaults';

/** A fuller category tree than new files get, so the demo shows nested categories. */
const DEMO_CATEGORIES: CategoryTreeSpec = [
  ['Income', ['Salary', 'Bonus', 'Interest', 'Dividends', 'Other Income'], 'income'],
  ['Housing', ['Rent & Mortgage', 'Utilities', 'Maintenance']],
  ['Bills', ['Cell Service', 'Internet', 'Subscriptions', 'Insurance']],
  ['Food', ['Groceries', 'Restaurants', 'Coffee']],
  ['Transportation', ['Gas', 'Public Transit', 'Parking', 'Rideshare']],
  ['Shopping', ['Clothing', 'Household', 'Electronics']],
  ['Health', ['Medical', 'Pharmacy', 'Fitness']],
  ['Personal', ['Personal Care', 'Education', 'Gifts', 'Charity']],
  ['Entertainment', []],
  ['Travel', ['Flights', 'Lodging']],
  ['Fees & Interest', []],
  ['Taxes', []],
];
import type {
  Account,
  AccountType,
  BalanceSnapshot,
  Category,
  Cents,
  Id,
  Tag,
  TemplateLine,
  Transaction,
} from '../schema/types';

export interface DemoOptions {
  /** Last date with data (inclusive). Pass explicitly for deterministic output. */
  endDate: ISODate;
  appVersion: string;
  seed?: number;
  /** Years of history ending at `endDate` (default 3). */
  years?: number;
  /** Multiplier for discretionary spending volume, for large benchmark files (default 1). */
  scale?: number;
}

/** mulberry32: tiny, fast, good-enough seeded PRNG. */
function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    chance: (p: number) => next() < p,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    /** Random amount in dollars [min, max], returned as cents. */
    cents: (min: number, max: number): Cents => Math.round((min + next() * (max - min)) * 100),
    /** Approximately normal (Irwin–Hall). */
    normal: (mean: number, sd: number) => {
      let s = 0;
      for (let i = 0; i < 6; i++) s += next();
      return mean + (s - 3) * sd * Math.SQRT2;
    },
  };
}

const ID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function generateDemoDocument(options: DemoOptions): DocModel {
  const rng = createRng(options.seed ?? 42);
  const scale = options.scale ?? 1;
  const years = options.years ?? 3;
  const end = options.endDate;
  const start = addDays(end, -Math.round(years * 365.25) + 1);
  const stamp = (date: ISODate) => `${date}T12:00:00.000Z`;
  const now = stamp(end);

  const makeId = (kind: IdKind): Id => {
    let out = '';
    for (let i = 0; i < 12; i++) out += ID_CHARS.charAt(Math.floor(rng.next() * 62));
    return `${ID_PREFIXES[kind]}_${out}`;
  };

  const doc = createEmptyDocument({
    appVersion: options.appVersion,
    now,
    starterCategories: false,
  });
  doc.meta.fileId = makeId('file');
  doc.meta.createdAt = stamp(start);

  // ── Reference data ──
  const categories = starterCategories(now, makeId, DEMO_CATEGORIES);
  for (const c of categories) doc.categories[c.id] = c;
  const cat = (name: string): Id => {
    const found: Category | undefined = categories.find((c) => c.name === name);
    if (!found) throw new Error(`Unknown demo category ${name}`);
    return found.id;
  };

  const account = (name: string, type: AccountType, order: number, institution?: string): Id => {
    const a: Account = { id: makeId('account'), name, type, order, updatedAt: now };
    if (institution) a.institution = institution;
    doc.accounts[a.id] = a;
    return a.id;
  };
  const checking = account('Everyday Checking', 'checking', 0, 'First Example Bank');
  const savings = account('High-Yield Savings', 'savings', 1, 'First Example Bank');
  const card = account('Rewards Card', 'credit', 2, 'Sample Card Co');
  const travelCard = account('Travel Card', 'credit', 3, 'Demo Credit Union');
  const brokerage = account('Brokerage', 'brokerage', 4, 'Placeholder Investments');
  const retirement = account('401(k)', 'retirement', 5, 'Placeholder Investments');

  const tag = (name: string): Id => {
    const t: Tag = { id: makeId('tag'), name, updatedAt: now };
    doc.tags[t.id] = t;
    return t.id;
  };
  const reimbursable = tag('reimbursable');
  const tripTags = new Map<number, Id>();

  // ── Transactions ──
  const balances = new Map<Id, Cents>();
  const reconcileBefore = addDays(end, -45);

  const add = (
    accountId: Id,
    date: ISODate,
    payee: string,
    amount: Cents,
    extra: Partial<Transaction> = {},
  ): Transaction => {
    const t: Transaction = {
      id: makeId('transaction'),
      accountId,
      date,
      payee,
      amount,
      createdAt: stamp(date),
      updatedAt: stamp(date),
      ...extra,
    };
    if (date < reconcileBefore) t.reconciled = true;
    putTransaction(doc, t);
    balances.set(accountId, (balances.get(accountId) ?? 0) + amount);
    return t;
  };

  const spend = (
    accountId: Id,
    date: ISODate,
    payee: string,
    category: string,
    amount: Cents,
    tags?: Id[],
  ) =>
    add(accountId, date, payee, -amount, { categoryId: cat(category), ...(tags ? { tags } : {}) });

  const transfer = (from: Id, to: Id, date: ISODate, amount: Cents, payee: string) => {
    const out = add(from, date, payee, -amount);
    const inn = add(to, date, payee, amount);
    out.transfer = { peerId: inn.id };
    inn.transfer = { peerId: out.id };
  };

  const snapshot = (accountId: Id, date: ISODate, balance: Cents) => {
    const s: BalanceSnapshot = {
      id: makeId('snapshot'),
      accountId,
      date,
      balance,
      source: 'manual',
      updatedAt: stamp(date),
    };
    doc.balanceSnapshots[s.id] = s;
    balances.set(accountId, balance);
  };

  const grocers = ['Green Basket Market', 'Corner Grocer', 'Harvest Lane Foods'];
  const restaurants = [
    'Blue Door Bistro',
    'Noodle Theory',
    'Taqueria Sol',
    'The Daily Plate',
    'Pho Corner',
  ];
  const cafes = ['Bean There Coffee', 'Morning Ritual Cafe'];
  const shops = [
    ['Northwind Apparel', 'Clothing'],
    ['Homeward Goods', 'Household'],
    ['Circuit Supply', 'Electronics'],
  ] as const;

  // Opening balances.
  snapshot(checking, start, 420000);
  snapshot(savings, start, 1500000);
  snapshot(brokerage, start, 2800000);
  snapshot(retirement, start, 6400000);

  const tripMonth = new Map<number, number>();
  const insuranceMonth = new Map<number, number>();
  const totalDays = diffDays(start, end);
  const perDay = (perWeek: number) => (perWeek * scale) / 7;
  /** How many times an event with the given daily rate happens today. */
  const times = (rate: number) => Math.floor(rate) + (rng.chance(rate % 1) ? 1 : 0);

  for (let i = 0; i <= totalDays; i++) {
    const date = addDays(start, i);
    const { year, month, day } = dateParts(date);
    if (!tripMonth.has(year)) tripMonth.set(year, rng.int(3, 10));
    if (!insuranceMonth.has(year)) insuranceMonth.set(year, rng.int(1, 12));

    // Income: biweekly paycheck (anchored to the start date), monthly interest, quarterly dividends.
    if (dayOfWeek(date) === 5 && Math.floor(i / 7) % 2 === 0) {
      add(checking, date, 'Example Corp Payroll', rng.cents(3180, 3320), {
        categoryId: cat('Salary'),
      });
    }
    if (day === 28)
      add(savings, date, 'Interest', Math.round((balances.get(savings) ?? 0) * 0.0035), {
        categoryId: cat('Interest'),
      });
    if (day === 15 && month % 3 === 0)
      add(brokerage, date, 'Dividend', rng.cents(60, 160), { categoryId: cat('Dividends') });

    // Fixed monthly bills.
    if (day === 1) spend(checking, date, 'Maple Street Apartments', 'Rent & Mortgage', 210000);
    if (day === 12) spend(card, date, 'City Power & Water', 'Utilities', rng.cents(80, 170));
    if (day === 18) spend(card, date, 'FiberNet', 'Internet', 6999);
    if (day === 22) spend(card, date, 'Mobile One', 'Cell Service', 6500);
    if (day === 3) spend(card, date, 'StreamBox', 'Subscriptions', 1599);
    if (day === 9) spend(card, date, 'CloudDrive Plus', 'Subscriptions', 999);
    if (day === 2) spend(card, date, 'Iron Works Gym', 'Fitness', 4500);
    if (day === 7 && month === insuranceMonth.get(year))
      spend(checking, date, 'Safe Harbor Insurance', 'Insurance', rng.cents(1100, 1400));

    // Transfers between own accounts.
    if (day === 5) transfer(checking, savings, date, 50000, 'Transfer to savings');
    if (day === 10) transfer(checking, brokerage, date, 75000, 'Brokerage contribution');
    if (day === 25) {
      for (const c of [card, travelCard]) {
        const owed = -(balances.get(c) ?? 0);
        if (owed > 0) transfer(checking, c, date, owed, 'Card payment');
      }
    }

    // Investment growth: monthly snapshots applying a random market return.
    if (day === 1 && i > 0) {
      for (const acct of [brokerage, retirement]) {
        const contribution = acct === retirement ? 95000 : 0;
        const growth = 1 + rng.normal(0.006, 0.035);
        snapshot(acct, date, Math.round(((balances.get(acct) ?? 0) + contribution) * growth));
      }
    }

    // Discretionary spending.
    for (let n = times(perDay(1.6)); n > 0; n--) {
      const amount = rng.cents(25, 190);
      if (rng.chance(0.05)) {
        // Mixed basket: split between groceries and household goods.
        const household = Math.round(amount * (0.2 + rng.next() * 0.4));
        add(card, date, rng.pick(grocers), -amount, {
          splits: [
            { id: makeId('split'), amount: -(amount - household), categoryId: cat('Groceries') },
            { id: makeId('split'), amount: -household, categoryId: cat('Household') },
          ],
        });
      } else {
        spend(card, date, rng.pick(grocers), 'Groceries', amount);
      }
    }
    for (let n = times(perDay(2)); n > 0; n--) {
      const amount = rng.cents(14, 95);
      if (rng.chance(0.04)) {
        // Paid for a group; others' share is excluded from budgets and tagged reimbursable.
        const mine = Math.round(amount / rng.int(3, 5));
        add(card, date, rng.pick(restaurants), -amount, {
          splits: [
            { id: makeId('split'), amount: -mine, categoryId: cat('Restaurants') },
            { id: makeId('split'), amount: -(amount - mine), excluded: true, tags: [reimbursable] },
          ],
        });
      } else {
        spend(card, date, rng.pick(restaurants), 'Restaurants', amount);
      }
    }
    for (let n = times(perDay(3)); n > 0; n--)
      spend(card, date, rng.pick(cafes), 'Coffee', rng.cents(4, 8));
    for (let n = times(perDay(0.8)); n > 0; n--)
      spend(card, date, 'QuickFuel', 'Gas', rng.cents(32, 64));
    for (let n = times(perDay(0.4)); n > 0; n--)
      spend(card, date, 'RideNow', 'Rideshare', rng.cents(9, 38));
    for (let n = times(perDay(1)); n > 0; n--) {
      const [payee, category] = rng.pick(shops);
      spend(card, date, payee, category, rng.cents(12, category === 'Electronics' ? 320 : 140));
    }
    for (let n = times(perDay(0.7)); n > 0; n--)
      spend(
        card,
        date,
        rng.pick(['Starlight Cinema', 'Arcade Alley', 'Live at the Hall']),
        'Entertainment',
        rng.cents(12, 85),
      );
    for (let n = times(perDay(0.25)); n > 0; n--)
      spend(card, date, 'Wellness Pharmacy', 'Pharmacy', rng.cents(8, 60));
    for (let n = times(perDay(0.1)); n > 0; n--)
      spend(card, date, 'Gift Gallery', 'Gifts', rng.cents(20, 120));

    // Annual trip: a week of travel spending on the travel card, tagged for a custom budget.
    if (month === tripMonth.get(year) && day >= 10 && day <= 16) {
      let tripTag = tripTags.get(year);
      if (!tripTag) {
        tripTag = tag(`trip-${year}`);
        tripTags.set(year, tripTag);
      }
      if (day === 10) {
        spend(travelCard, date, 'Skyway Airlines', 'Flights', rng.cents(380, 760), [tripTag]);
        spend(travelCard, date, 'Harborview Hotel', 'Lodging', rng.cents(900, 1700), [tripTag]);
      }
      for (let k = rng.int(1, 3); k > 0; k--) {
        spend(travelCard, date, rng.pick(restaurants), 'Restaurants', rng.cents(18, 110), [
          tripTag,
        ]);
      }
    }
  }

  // ── Budget template ──
  const line = (
    cadence: 'monthly' | 'annual',
    target: TemplateLine['target'],
    dollars: number,
    order: number,
    name?: string,
    note?: string,
  ) => {
    const l: TemplateLine = {
      id: makeId('budgetLine'),
      cadence,
      target,
      defaultAmount: dollars * 100,
      rolloverPolicy: 'prompt',
      order,
    };
    if (name) l.name = name;
    if (note) l.note = note;
    doc.budgets.template.lines[l.id] = l;
  };
  const cats = (...names: string[]) => ({
    kind: 'categories' as const,
    categoryIds: names.map(cat),
  });
  line(
    'monthly',
    cats('Housing'),
    2350,
    0,
    undefined,
    'Rent plus utilities; the lease renews in June.',
  );
  line('monthly', cats('Food'), 950, 1);
  line('monthly', cats('Bills'), 260, 2);
  line('monthly', cats('Transportation'), 220, 3);
  line('monthly', cats('Shopping'), 350, 4);
  line('monthly', cats('Entertainment'), 120, 5);
  line('monthly', cats('Health'), 100, 6);
  line('monthly', { kind: 'everythingElse' }, 150, 7, 'Everything Else');
  line('annual', cats('Travel'), 3200, 0);
  line('annual', cats('Insurance'), 1400, 1);
  line('annual', cats('Gifts'), 600, 2);

  // ── Budget periods: the two months before the current one, and this year ──
  const templateLines = Object.values(doc.budgets.template.lines);
  const periodLines = (cadence: 'monthly' | 'annual') =>
    templateLines
      .filter((l) => l.cadence === cadence)
      .sort((a, b) => a.order - b.order)
      .map((l) => ({
        templateLineId: l.id,
        target: structuredClone(l.target),
        base: l.defaultAmount,
        rollover: 0,
      }));
  for (const offset of [2, 1]) {
    const period = addMonths(end, -offset).slice(0, 7);
    const id = makeId('budgetPeriod');
    const lines = periodLines('monthly');
    const first = lines[0];
    if (offset === 1 && first) {
      first.base += 15000;
      Object.assign(first, { note: 'Raised for a one-off repair this month.' });
    }
    doc.budgets.periods[id] = {
      id,
      cadence: 'monthly',
      period,
      lines,
      createdAt: now,
      updatedAt: now,
    };
  }
  const annualId = makeId('budgetPeriod');
  doc.budgets.periods[annualId] = {
    id: annualId,
    cadence: 'annual',
    period: end.slice(0, 4),
    lines: periodLines('annual'),
    createdAt: now,
    updatedAt: now,
  };

  // ── A custom budget for the most recent trip ──
  const lastTrip = [...tripTags.entries()].sort(([a], [b]) => b - a)[0];
  if (lastTrip) {
    const [year, tagId] = lastTrip;
    const id = makeId('customBudget');
    doc.budgets.custom[id] = {
      id,
      name: `Trip ${year}`,
      match: { tags: [tagId], mode: 'any' },
      lines: [
        { id: makeId('budgetLine'), name: 'Travel', target: cats('Travel'), amount: 250000 },
        { id: makeId('budgetLine'), name: 'Food', target: cats('Food'), amount: 60000 },
        {
          id: makeId('budgetLine'),
          name: 'Everything else',
          target: { kind: 'everythingElse' },
          amount: 20000,
        },
      ],
      priority: 0,
      updatedAt: now,
    };
  }

  return doc;
}

import { beforeEach, describe, expect, it } from 'vitest';
import { CommandError } from '@/domain/commands';
import { getTransaction, iterateTransactions } from '@/domain/model';
import { testDocument } from '@/test/documents';
import { createDocStore } from './docStore';

let store: ReturnType<typeof createDocStore>;
const doc = () => store.getState().doc!;
const d = () => store.getState().dispatch;
const cat = (name: string) => Object.values(doc().categories).find((c) => c.name === name)!.id;

let checking: string;
let card: string;

beforeEach(() => {
  store = createDocStore();
  store.getState().load(testDocument());
  checking = d()('createAccount', { name: 'Checking', type: 'checking' });
  card = d()('createAccount', { name: 'Card', type: 'credit' });
});

describe('transfers', () => {
  it('creates a linked pair and keeps amounts mirrored', () => {
    const id = d()('createTransaction', {
      accountId: checking,
      date: '2026-11-01',
      payee: 'Card payment',
      amount: -50000,
      transferAccountId: card,
    });
    const t = getTransaction(doc(), id)!;
    const peer = getTransaction(doc(), t.transfer!.peerId)!;
    expect(peer).toMatchObject({ accountId: card, amount: 50000, transfer: { peerId: id } });

    d()('updateTransaction', { id, changes: { amount: -42000 } });
    expect(getTransaction(doc(), peer.id)!.amount).toBe(42000);
  });

  it('converts between regular transactions and transfers', () => {
    const id = d()('createTransaction', {
      accountId: checking,
      date: '2026-11-01',
      payee: 'Move',
      amount: -1000,
      categoryId: cat('Groceries'),
    });
    d()('setTransferAccount', { id, accountId: card });
    const t = getTransaction(doc(), id)!;
    expect(t.categoryId).toBeUndefined();
    expect(getTransaction(doc(), t.transfer!.peerId)?.accountId).toBe(card);

    d()('setTransferAccount', { id, accountId: null });
    expect(getTransaction(doc(), id)!.transfer).toBeUndefined();
    expect([...iterateTransactions(doc())]).toHaveLength(1);
  });

  it('rejects categorizing a transfer', () => {
    const id = d()('createTransaction', {
      accountId: checking,
      date: '2026-11-01',
      payee: 'x',
      amount: -1,
      transferAccountId: card,
    });
    expect(() => {
      d()('updateTransaction', { id, changes: { categoryId: cat('Food') } });
    }).toThrow(CommandError);
  });
});

describe('copy', () => {
  it('copies a transaction to a new date without its reconciliation', () => {
    const tag = d()('createTag', { name: 'trip' });
    const id = d()('createTransaction', {
      accountId: card,
      date: '2026-10-01',
      payee: 'Cafe',
      amount: -450,
      categoryId: cat('Restaurants'),
      tags: [tag],
      note: 'latte',
    });
    d()('updateTransaction', { id, changes: { reconciled: true } });
    const [copyId] = d()('copyTransactions', { ids: [id], date: '2026-11-20' });
    const copy = getTransaction(doc(), copyId!)!;
    expect(copy.id).not.toBe(id);
    expect(copy).toMatchObject({
      accountId: card,
      date: '2026-11-20',
      payee: 'Cafe',
      amount: -450,
      categoryId: cat('Restaurants'),
      tags: [tag],
      note: 'latte',
    });
    expect(copy.reconciled).toBeUndefined();
  });

  it('copies a transfer as a new linked pair, once per pair', () => {
    const id = d()('createTransaction', {
      accountId: checking,
      date: '2026-10-01',
      payee: 'Card payment',
      amount: -50000,
      transferAccountId: card,
    });
    const peerId = getTransaction(doc(), id)!.transfer!.peerId;
    const copies = d()('copyTransactions', { ids: [id, peerId], date: '2026-11-20' });
    expect(copies).toHaveLength(1);
    const copy = getTransaction(doc(), copies[0]!)!;
    const peer = getTransaction(doc(), copy.transfer!.peerId)!;
    expect(peer).toMatchObject({
      accountId: card,
      amount: 50000,
      date: '2026-11-20',
      transfer: { peerId: copy.id },
    });
    expect([...iterateTransactions(doc())]).toHaveLength(4);
  });

  it('gives split copies their own split ids', () => {
    const id = d()('createTransaction', {
      accountId: card,
      date: '2026-10-02',
      payee: 'M',
      amount: -100,
    });
    const tag = d()('createTag', { name: 'shared' });
    d()('setSplits', { id, splits: [{ amount: -60, tags: [tag] }, { amount: -40 }] });
    const [copyId] = d()('copyTransactions', { ids: [id], date: '2026-11-20' });
    expect(getTransaction(doc(), copyId!)!.splits![0]!.tags).toEqual([tag]);
    const original = getTransaction(doc(), id)!.splits!.map((s) => s.id);
    const copied = getTransaction(doc(), copyId!)!.splits!;
    expect(copied.map((s) => s.amount)).toEqual([-60, -40]);
    expect(copied.some((s) => original.includes(s.id))).toBe(false);
  });
});

describe('splits', () => {
  it('splits and unsplits a transaction', () => {
    const id = d()('createTransaction', {
      accountId: card,
      date: '2026-11-02',
      payee: 'Market',
      amount: -10000,
      categoryId: cat('Groceries'),
    });
    d()('setSplits', {
      id,
      splits: [
        { amount: -7000, categoryId: cat('Groceries') },
        { amount: -3000, categoryId: cat('Household'), excluded: true },
      ],
    });
    const split = getTransaction(doc(), id)!;
    expect(split.categoryId).toBeUndefined();
    expect(split.splits).toHaveLength(2);
    expect(split.splits![1]).toMatchObject({ amount: -3000, excluded: true });

    d()('setSplits', { id, splits: [{ amount: -10000, categoryId: cat('Household') }] });
    const unsplit = getTransaction(doc(), id)!;
    expect(unsplit.splits).toBeUndefined();
    expect(unsplit.categoryId).toBe(cat('Household'));
  });

  it('requires splits to add up', () => {
    const id = d()('createTransaction', {
      accountId: card,
      date: '2026-11-02',
      payee: 'M',
      amount: -100,
    });
    expect(() => {
      d()('setSplits', { id, splits: [{ amount: -60 }, { amount: -30 }] });
    }).toThrow(/add up/);
  });
});

describe('bulk edits', () => {
  it('applies tags and categories as one undoable step', () => {
    const ids = [1, 2, 3].map((n) =>
      d()('createTransaction', { accountId: card, date: `2026-11-0${n}`, payee: 'P', amount: -n }),
    );
    const tag = d()('createTag', { name: 'trip' });
    const count = d()('updateTransactions', {
      ids,
      changes: { categoryId: cat('Restaurants'), addTags: [tag], reconciled: true },
    });
    expect(count).toBe(3);
    for (const id of ids) {
      expect(getTransaction(doc(), id)).toMatchObject({
        categoryId: cat('Restaurants'),
        tags: [tag],
        reconciled: true,
      });
    }
    store.getState().undo();
    for (const id of ids) expect(getTransaction(doc(), id)!.tags).toBeUndefined();
  });
});

describe('categories', () => {
  it('deletes a category, reassigning transactions and lifting children', () => {
    const food = cat('Food');
    const groceries = cat('Groceries');
    const id = d()('createTransaction', {
      accountId: card,
      date: '2026-11-02',
      payee: 'M',
      amount: -100,
      categoryId: food,
    });
    d()('deleteCategory', { id: food, reassignTo: cat('Shopping') });
    expect(getTransaction(doc(), id)!.categoryId).toBe(cat('Shopping'));
    expect(doc().categories[groceries]!.parentId).toBeNull();
    expect(doc().categories[food]).toBeUndefined();
  });

  it('prevents moving a category inside its own subtree', () => {
    expect(() => {
      d()('setCategoryParent', { id: cat('Food'), parentId: cat('Groceries') });
    }).toThrow(CommandError);
  });

  it('reorders siblings', () => {
    const top = () =>
      Object.values(doc().categories)
        .filter((c) => c.parentId === null)
        .sort((a, b) => a.order - b.order)
        .map((c) => c.name);
    expect(top().slice(0, 2)).toEqual(['Income', 'Housing']);
    const ids = Object.values(doc().categories)
      .filter((c) => c.parentId === null)
      .sort((a, b) => a.order - b.order)
      .map((c) => c.id);
    d()('reorderCategories', { parentId: null, ids: [ids[1]!, ids[0]!, ...ids.slice(2)] });
    expect(top().slice(0, 2)).toEqual(['Housing', 'Income']);
    expect(() => {
      d()('reorderCategories', { parentId: null, ids: [cat('Groceries'), ...ids.slice(1)] });
    }).toThrow(CommandError);
  });
});

describe('tags and accounts', () => {
  it('deletes a tag from all transactions', () => {
    const tag = d()('createTag', { name: 'gift' });
    const id = d()('createTransaction', {
      accountId: card,
      date: '2026-11-02',
      payee: 'M',
      amount: -1,
      tags: [tag],
    });
    d()('deleteTag', { id: tag });
    expect(getTransaction(doc(), id)!.tags).toBeUndefined();
  });

  it('refuses duplicate tag names', () => {
    d()('createTag', { name: 'Gift' });
    expect(() => d()('createTag', { name: 'gift' })).toThrow(CommandError);
  });

  it('only deletes accounts without transactions', () => {
    d()('createTransaction', { accountId: card, date: '2026-11-02', payee: 'M', amount: -1 });
    expect(() => {
      d()('deleteAccount', { id: card });
    }).toThrow(/Close it instead/);
    d()('deleteAccount', { id: checking });
    expect(doc().accounts[checking]).toBeUndefined();
  });
});

describe('saveTransaction', () => {
  const form = (over: object = {}) => ({
    accountId: card,
    date: '2026-11-05',
    payee: 'Bistro',
    amount: -4500,
    categoryId: cat('Restaurants'),
    transferAccountId: null,
    tagNames: ['date night', 'Trip'],
    note: '',
    ...over,
  });

  it('creates a transaction and its new tags in one undo step', () => {
    const id = d()('saveTransaction', form());
    expect(
      Object.values(doc().tags)
        .map((t) => t.name)
        .sort(),
    ).toEqual(['Trip', 'date night']);
    expect(getTransaction(doc(), id)!.tags).toHaveLength(2);
    store.getState().undo();
    expect(Object.keys(doc().tags)).toHaveLength(0);
    expect(getTransaction(doc(), id)).toBeUndefined();
  });

  it('turns a categorized transaction into a transfer and back', () => {
    const id = d()('saveTransaction', form({ tagNames: [] }));
    d()(
      'saveTransaction',
      form({ id, categoryId: null, transferAccountId: checking, tagNames: [] }),
    );
    const t = getTransaction(doc(), id)!;
    expect(t.categoryId).toBeUndefined();
    expect(getTransaction(doc(), t.transfer!.peerId)).toMatchObject({
      accountId: checking,
      amount: 4500,
    });

    d()('saveTransaction', form({ id, tagNames: [] }));
    expect(getTransaction(doc(), id)).toMatchObject({ categoryId: cat('Restaurants') });
    expect(getTransaction(doc(), id)!.transfer).toBeUndefined();
    expect([...iterateTransactions(doc())]).toHaveLength(1);
  });

  it('reuses existing tags case-insensitively', () => {
    const tag = d()('createTag', { name: 'Trip' });
    const id = d()('saveTransaction', form({ tagNames: ['trip'] }));
    expect(getTransaction(doc(), id)!.tags).toEqual([tag]);
  });
});

describe('balance snapshots', () => {
  it('keeps one snapshot per account and date', () => {
    const a = d()('createSnapshot', { accountId: checking, date: '2026-11-01', balance: 100000 });
    const b = d()('createSnapshot', {
      accountId: checking,
      date: '2026-11-01',
      balance: 120000,
      note: 'fixed',
    });
    expect(b).toBe(a);
    expect(doc().balanceSnapshots[a]).toMatchObject({ balance: 120000, note: 'fixed' });
    d()('deleteSnapshot', { id: a });
    expect(Object.keys(doc().balanceSnapshots)).toHaveLength(0);
  });
});

describe('planner scenarios', () => {
  it('creates from a template, duplicates with remapped links, and cleans dangling links', () => {
    const id = d()('createScenario', {
      name: 'Freelance',
      year: 2026,
      template: { filing: 'single', selfEmployment: true, stateRate: 0 },
    });
    const original = doc().planner.scenarios[id]!;
    const federal = original.taxes.find((t) => t.name === 'Federal income tax')!;
    expect(federal.lessTaxes).toHaveLength(2);

    const copyId = d()('duplicateScenario', { id });
    const copy = doc().planner.scenarios[copyId]!;
    const copyFederal = copy.taxes.find((t) => t.name === 'Federal income tax')!;
    const copyIds = new Set(copy.taxes.map((t) => t.id));
    expect(copyFederal.lessTaxes?.every((l) => copyIds.has(l.taxId))).toBe(true);
    expect(copy.taxes.some((t) => original.taxes.some((o) => o.id === t.id))).toBe(false);

    // Deleting the SE rules removes the references to them.
    d()('updateScenario', {
      id,
      changes: { taxes: original.taxes.filter((t) => !t.name.startsWith('Self')) },
    });
    expect(
      doc().planner.scenarios[id]!.taxes.find((t) => t.name === 'Federal income tax')!.lessTaxes,
    ).toBeUndefined();
  });

  it('stores a description and switched-off savings, and keeps them when duplicating', () => {
    const id = d()('createScenario', { name: 'Plan', year: 2026, template: null });
    d()('updateScenario', {
      id,
      changes: {
        description: '  What if I go part-time?  ',
        savings: 1200_00,
        savingsDisabled: true,
      },
    });
    const s = doc().planner.scenarios[id]!;
    expect(s.description).toBe('What if I go part-time?');
    expect(s.savingsDisabled).toBe(true);
    expect(s.savings).toBe(1200_00);

    const copyId = d()('duplicateScenario', { id });
    const copy = doc().planner.scenarios[copyId]!;
    expect(copy.description).toBe('What if I go part-time?');
    expect(copy.savings).toBe(1200_00);
    expect(copy.savingsDisabled).toBe(true);

    d()('updateScenario', { id, changes: { description: ' ', savingsDisabled: false } });
    expect(doc().planner.scenarios[id]!.description).toBeUndefined();
    expect(doc().planner.scenarios[id]!.savingsDisabled).toBeUndefined();
  });

  it('keeps people links when duplicating and unassigns items when a person is removed', () => {
    const id = d()('createScenario', {
      name: 'Us',
      year: 2026,
      template: { filing: 'mfj', selfEmployment: false, stateRate: 0 },
    });
    const original = doc().planner.scenarios[id]!;
    expect(original.people).toHaveLength(2);
    expect(original.incomes.every((i) => original.people!.some((p) => p.id === i.person))).toBe(
      true,
    );

    const copyId = d()('duplicateScenario', { id });
    const copy = doc().planner.scenarios[copyId]!;
    const copyPeople = new Set(copy.people!.map((p) => p.id));
    expect(copy.incomes.every((i) => copyPeople.has(i.person!))).toBe(true);
    expect(copy.people!.some((p) => original.people!.some((o) => o.id === p.id))).toBe(false);

    d()('updateScenario', { id, changes: { people: [original.people![0]!] } });
    const after = doc().planner.scenarios[id]!;
    expect(after.incomes.filter((i) => i.person === undefined)).toHaveLength(1);
  });
});

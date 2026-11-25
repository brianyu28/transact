import { describe, expect, it } from 'vitest';
import { matchesWords, wordFilter } from './wordFilter';

describe('matchesWords', () => {
  it('matches every word anywhere in the label', () => {
    expect(matchesWords('Transfer ↔ Savings', 'transfer sav')).toBe(true);
    expect(matchesWords('Food › Groceries', 'food groc')).toBe(true);
    expect(matchesWords('Food › Groceries', 'groc')).toBe(true);
    expect(matchesWords('Food › Groceries', 'food rent')).toBe(false);
  });

  it('ignores typed separators and extra spaces', () => {
    expect(matchesWords('Food › Groceries', ' food > groceries ')).toBe(true);
    expect(matchesWords('Food › Groceries', '')).toBe(true);
  });
});

describe('wordFilter', () => {
  it('filters within groups and drops empty groups', () => {
    const options = [
      { group: 'Categories', items: [{ value: 'a', label: 'Food › Groceries' }] },
      { group: 'Transfer', items: [{ value: 'b', label: 'Transfer ↔ Savings' }] },
    ];
    expect(wordFilter({ options, search: 'transfer sav', limit: Infinity })).toEqual([
      { group: 'Transfer', items: [{ value: 'b', label: 'Transfer ↔ Savings' }] },
    ]);
  });
});

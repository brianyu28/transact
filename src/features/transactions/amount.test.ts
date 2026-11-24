import { describe, expect, it } from 'vitest';
import { resolveAmount } from './amount';

describe('resolveAmount', () => {
  it('treats unsigned amounts on new transactions as spending, or income for income categories', () => {
    expect(resolveAmount('42.10', { previous: undefined, income: false })).toBe(-4210);
    expect(resolveAmount('3200', { previous: undefined, income: true })).toBe(320000);
  });

  it('keeps the previous sign when editing', () => {
    expect(resolveAmount('50', { previous: 1000, income: false })).toBe(5000);
    expect(resolveAmount('50', { previous: -1000, income: true })).toBe(-5000);
  });

  it('respects explicit signs', () => {
    expect(resolveAmount('+12', { previous: -1, income: false })).toBe(1200);
    expect(resolveAmount('-12', { previous: 1, income: true })).toBe(-1200);
  });

  it('rejects invalid input', () => {
    expect(resolveAmount('abc', { previous: undefined, income: false })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { resolveAmount } from './amount';

describe('resolveAmount', () => {
  it('keeps the sign exactly as typed', () => {
    expect(resolveAmount('10')).toBe(1000);
    expect(resolveAmount('+12.50')).toBe(1250);
    expect(resolveAmount('-42.10')).toBe(-4210);
    expect(resolveAmount(' 3200 ')).toBe(320000);
  });

  it('rejects invalid input', () => {
    expect(resolveAmount('abc')).toBeNull();
    expect(resolveAmount('')).toBeNull();
  });
});

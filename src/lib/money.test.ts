import { describe, expect, it } from 'vitest';
import { centsToInput, formatMoney, parseMoney } from './money';

describe('parseMoney', () => {
  it.each([
    ['0', 0],
    ['12', 1200],
    ['12.3', 1230],
    ['12.34', 1234],
    ['.5', 50],
    ['$1,234.56', 123456],
    ['-12.30', -1230],
    ['-$12.30', -1230],
    ['+5', 500],
    ['(12.30)', -1230],
    [' 1 000.01 ', 100001],
    ['0.005', 1],
    ['0.004', 0],
    ['-0', 0],
    ['19.999', 2000],
  ])('parses %j as %d', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.2.3', '$', '-', '.', '1e5', '12-'])('rejects %j', (input) => {
    expect(parseMoney(input)).toBeNull();
  });
});

describe('centsToInput', () => {
  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [123456, '1234.56'],
    [-1230, '-12.30'],
  ])('formats %d as %s', (cents, expected) => {
    expect(centsToInput(cents)).toBe(expected);
  });

  it('round-trips through parseMoney', () => {
    for (const c of [0, 1, -1, 99, 100, -123456, 987654321]) {
      expect(parseMoney(centsToInput(c))).toBe(c);
    }
  });
});

describe('formatMoney', () => {
  it('formats with currency symbol', () => {
    expect(formatMoney(-123456)).toBe('-$1,234.56');
    expect(formatMoney(5)).toBe('$0.05');
  });

  it('supports sign and symbol options', () => {
    expect(formatMoney(1200, { sign: 'always' })).toBe('+$12.00');
    expect(formatMoney(-1200, { symbol: false })).toBe('-12.00');
  });
});

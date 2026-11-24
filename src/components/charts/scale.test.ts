import { describe, expect, it } from 'vitest';
import { niceTicks } from './scale';

describe('niceTicks', () => {
  it('covers the range with round steps and includes zero', () => {
    expect(niceTicks(0, 9300)).toEqual([0, 2500, 5000, 7500, 10000]);
    expect(niceTicks(-1200, 3400)).toEqual([-2000, 0, 2000, 4000]);
    expect(niceTicks(0, 0)).toEqual([0, 1]);
  });
});

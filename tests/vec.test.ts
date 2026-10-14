import { describe, expect, it } from 'vitest';
import { FORWARD, UP, add, cross, dot, len, lerp, mul, mulv, normalize, sub } from '../src/core/vec';

describe('vec', () => {
  it('adds, subtracts and scales', () => {
    expect(add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
    expect(sub([4, 5, 6], [1, 2, 3])).toEqual([3, 3, 3]);
    expect(mul([1, 2, 3], 2)).toEqual([2, 4, 6]);
    expect(mulv([1, 2, 3], [2, 0, -1])).toEqual([2, 0, -3]);
  });

  it('computes dot, length and lerp', () => {
    expect(dot([1, 2, 3], [4, -5, 6])).toBe(12);
    expect(len([3, 4, 0])).toBe(5);
    expect(lerp([0, 0, 0], [10, 20, 30], 0.5)).toEqual([5, 10, 15]);
    expect(lerp([1, 1, 1], [3, 3, 3], 0)).toEqual([1, 1, 1]);
    expect(lerp([1, 1, 1], [3, 3, 3], 1)).toEqual([3, 3, 3]);
  });

  it('crosses right-handed: x × y = z', () => {
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(cross([0, 1, 0], [0, 0, 1])).toEqual([1, 0, 0]);
    expect(cross(UP, FORWARD)).toEqual([1, 0, 0]);
  });

  it('normalises to unit length', () => {
    expect(len(normalize([0, 3, 4]))).toBeCloseTo(1, 12);
    expect(normalize([0, 0, 5])).toEqual([0, 0, 1]);
  });

  it('returns the fallback for a zero vector', () => {
    expect(normalize([0, 0, 0])).toEqual([0, 1, 0]);
    expect(normalize([0, 0, 0], [1, 0, 0])).toEqual([1, 0, 0]);
    expect(normalize([1e-12, 0, 0], FORWARD)).toEqual(FORWARD);
  });
});

import { describe, expect, it } from 'vitest';
import { AXIS_LEGEND, keyboardDirection } from '../src/core/move';

const keys = (...k: string[]) => new Set(k);

describe('keyboardDirection', () => {
  it('maps each key to a fixed world axis', () => {
    expect(keyboardDirection(keys('w'))).toEqual([0, 0, -1]);
    expect(keyboardDirection(keys('s'))).toEqual([0, 0, 1]);
    expect(keyboardDirection(keys('d'))).toEqual([1, 0, 0]);
    expect(keyboardDirection(keys('a'))).toEqual([-1, 0, 0]);
    expect(keyboardDirection(keys('arrowup'))).toEqual([0, 1, 0]);
    expect(keyboardDirection(keys('arrowdown'))).toEqual([0, -1, 0]);
  });

  it('returns zero when opposite keys cancel or nothing is held', () => {
    expect(keyboardDirection(keys('w', 's'))).toEqual([0, 0, 0]);
    expect(keyboardDirection(keys())).toEqual([0, 0, 0]);
  });

  it('combines keys without changing the axes', () => {
    expect(keyboardDirection(keys('w', 'd', 'arrowup'))).toEqual([1, 1, -1]);
  });

  it('has one legend row per movement axis', () => {
    expect(AXIS_LEGEND).toHaveLength(3);
  });
});

import { describe, expect, it } from 'vitest';
import { JointSelection } from '../src/core/selection';

describe('JointSelection', () => {
  it('starts empty', () => {
    const s = new JointSelection();
    expect(s.size).toBe(0);
    expect(s.list()).toEqual([]);
  });

  it('a plain select replaces the whole selection with one joint', () => {
    const s = new JointSelection();
    s.toggle('a');
    s.toggle('b');
    expect(s.set('c')).toBe(true);
    expect(s.list()).toEqual(['c']);
  });

  it('reports no change when selecting what is already the only selection', () => {
    const s = new JointSelection();
    s.set('a');
    expect(s.set('a')).toBe(false);
    expect(s.list()).toEqual(['a']);
  });

  it('clears on null, and reports no change when already empty', () => {
    const s = new JointSelection();
    expect(s.set(null)).toBe(false);
    s.toggle('a');
    s.toggle('b');
    expect(s.set(null)).toBe(true);
    expect(s.size).toBe(0);
  });

  it('toggle adds a joint and keeps the others', () => {
    const s = new JointSelection();
    s.toggle('a');
    s.toggle('b');
    expect(s.list()).toEqual(['a', 'b']);
    expect(s.has('a')).toBe(true);
  });

  it('toggle removes a joint that is already selected', () => {
    const s = new JointSelection();
    s.toggle('a');
    s.toggle('b');
    s.toggle('a');
    expect(s.list()).toEqual(['b']);
    expect(s.has('a')).toBe(false);
  });

  it('keeps the order the joints were picked in', () => {
    const s = new JointSelection();
    for (const id of ['tail2', 'earTipL', 'neck']) s.toggle(id);
    expect(s.list()).toEqual(['tail2', 'earTipL', 'neck']);
  });
});

import { describe, expect, it } from 'vitest';
import { catModel } from '../src/models/cat';
import { defaultParams, solveJoints } from '../src/core/rig';
import { partColor, partTransform } from '../src/core/parts';
import { dot, sub } from '../src/core/vec';
import type { BlobPart, ShapeParams } from '../src/core/types';

const defaults = defaultParams(catModel);
const eyePart = (side: 'L' | 'R') => catModel.parts.find((p) => p.id === `eye${side}`) as BlobPart;
const headPart = catModel.parts.find((p) => p.id === 'head')!;

/** Eye centre in the head's local frame (lateral, vertical, forward), in metres. */
const eyeInHead = (params: ShapeParams, side: 'L' | 'R') => {
  const joints = solveJoints(catModel, params);
  const head = partTransform(headPart, joints, params);
  const eye = partTransform(eyePart(side), joints, params);
  const d = sub(eye.position, head.position);
  return { local: [dot(d, head.axes[0]), dot(d, head.axes[1]), dot(d, head.axes[2])] as const, head };
};

describe('eye placement', () => {
  const corners = [0.7, 1.4].flatMap((eyeSpacing) => [0.5, 1.6].map((eyeHeight) => ({ eyeSpacing, eyeHeight })));

  for (const [name, overrides] of [
    ['defaults', {}],
    ...corners.map((c) => [`spacing ${c.eyeSpacing}, height ${c.eyeHeight}`, c] as const),
    ['narrow head', { headWidth: 0.6 }],
    ['wide head, wide spacing', { headWidth: 1.6, eyeSpacing: 1.4 }],
    ['big head, high eyes', { headSize: 1.8, eyeHeight: 1.6 }],
  ] as const) {
    it(`eyes sit on the head surface: ${name}`, () => {
      const params = { ...defaults, ...overrides };
      for (const side of ['L', 'R'] as const) {
        const { local, head } = eyeInHead(params, side);
        // Normalised radius of the eye centre in the head ellipsoid: 1 = on the surface.
        const n = Math.sqrt(local.reduce((sum, c, k) => sum + (c / head.scale[k]) ** 2, 0));
        expect(Math.abs(n - 1)).toBeLessThan(1e-6);
      }
    });
  }

  it('eye spacing moves the eyes apart and together, staying mirrored', () => {
    const close = { ...defaults, eyeSpacing: 0.7 };
    const wide = { ...defaults, eyeSpacing: 1.4 };
    expect(eyeInHead(wide, 'L').local[0]).toBeGreaterThan(eyeInHead(close, 'L').local[0]);

    const l = eyeInHead(wide, 'L').local;
    const r = eyeInHead(wide, 'R').local;
    expect(l[0]).toBeCloseTo(-r[0], 9);
    expect(l[1]).toBeCloseTo(r[1], 9);
    expect(l[2]).toBeCloseTo(r[2], 9);
  });

  it('eye height moves the eyes up and down the face', () => {
    const low = eyeInHead({ ...defaults, eyeHeight: 0.5 }, 'L').local[1];
    const high = eyeInHead({ ...defaults, eyeHeight: 1.6 }, 'L').local[1];
    expect(high).toBeGreaterThan(low);
  });

  it('defaults keep the eyes where the fixed offsets put them (0.044, 0.023, 0.058 at size 1)', () => {
    const [lateral, vertical, forward] = eyeInHead(defaults, 'L').local;
    expect(lateral).toBeCloseTo(0.044, 3);
    expect(vertical).toBeCloseTo(0.023, 3);
    expect(forward).toBeCloseTo(0.058, 3);
  });
});

describe('eye colour', () => {
  it('defaults to the original green on both eyes', () => {
    expect(defaults.eyeColor).toBe(0x56c264);
    expect(partColor(eyePart('L'), defaults)).toBe(0x56c264);
    expect(partColor(eyePart('R'), defaults)).toBe(0x56c264);
  });

  it('follows the eye colour param on both eyes', () => {
    const params = { ...defaults, eyeColor: 0x3366ff };
    expect(partColor(eyePart('L'), params)).toBe(0x3366ff);
    expect(partColor(eyePart('R'), params)).toBe(0x3366ff);
  });

  it('leaves the other parts alone', () => {
    const params = { ...defaults, eyeColor: 0x3366ff };
    expect(partColor(headPart, params)).toBe(partColor(headPart, defaults));
  });
});

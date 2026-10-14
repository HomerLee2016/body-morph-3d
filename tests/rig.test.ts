import { describe, expect, it } from 'vitest';
import { catModel } from '../src/models/cat';
import { defaultParams, modelScale, solveJoints, validateModel } from '../src/core/rig';
import { partTransform } from '../src/core/parts';
import { dot, len, sub } from '../src/core/vec';

const defaults = defaultParams(catModel);

describe('cat model definition', () => {
  it('is a valid single-rooted joint tree with known references', () => {
    expect(() => validateModel(catModel)).not.toThrow();
  });

  it('has unique slider ids with defaults inside their range', () => {
    const ids = catModel.sliders.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of catModel.sliders) {
      expect(s.default).toBeGreaterThanOrEqual(s.min);
      expect(s.default).toBeLessThanOrEqual(s.max);
    }
  });

  it('only reads sliders that exist (no NaN with default params)', () => {
    const joints = solveJoints(catModel, defaults);
    for (const pos of Object.values(joints)) for (const c of pos) expect(Number.isFinite(c)).toBe(true);
    for (const part of catModel.parts) {
      const t = partTransform(part, joints, defaults);
      for (const c of [...t.position, ...t.scale]) expect(Number.isFinite(c)).toBe(true);
      for (const s of t.scale) expect(s).toBeGreaterThan(0);
    }
  });
});

describe('solveJoints', () => {
  it('puts the paws on the ground at rest', () => {
    const joints = solveJoints(catModel, defaults);
    const lowest = Math.min(...catModel.groundJoints.map((id) => joints[id][1]));
    expect(lowest).toBeCloseTo(catModel.groundClearance, 6);
  });

  it('keeps the paws on the ground when legs get longer', () => {
    const joints = solveJoints(catModel, { ...defaults, frontLegLength: 1.6, hindLegLength: 1.4 });
    const lowest = Math.min(...catModel.groundJoints.map((id) => joints[id][1]));
    expect(lowest).toBeCloseTo(catModel.groundClearance, 6);
  });

  it('scales the neck length slider', () => {
    const short = solveJoints(catModel, { ...defaults, neckLength: 0.5 });
    const long = solveJoints(catModel, { ...defaults, neckLength: 2 });
    const d = (j: typeof short) => len(sub(j.head, j.neck));
    expect(d(long) / d(short)).toBeCloseTo(4, 5);
  });

  it('moves only the posed joint, not its children or parent', () => {
    const base = solveJoints(catModel, defaults);
    const moved = solveJoints(catModel, defaults, { chest: [0, 0.1, 0] });
    expect(moved.chest[1] - base.chest[1]).toBeCloseTo(0.1, 6);
    expect(moved.head).toEqual(base.head);
    expect(moved.shoulderL).toEqual(base.shoulderL);
    expect(moved.pelvis).toEqual(base.pelvis);
    expect(moved.hipL).toEqual(base.hipL);
  });

  it('does not re-ground the model when only the pose changes', () => {
    const base = solveJoints(catModel, defaults);
    const raised = solveJoints(catModel, defaults, { pelvis: [0, 0.2, 0] });
    expect(raised.pelvis[1] - base.pelvis[1]).toBeCloseTo(0.2, 6);
    expect(raised.frontPawL).toEqual(base.frontPawL);
  });

  it('rejects broken models', () => {
    const bad = { ...catModel, joints: [...catModel.joints].reverse() };
    expect(() => validateModel(bad)).toThrow();
  });
});

describe('modelScale', () => {
  it('reads the size slider', () => {
    expect(modelScale(catModel, { ...defaults, size: 1.5 })).toBe(1.5);
    expect(modelScale(catModel, defaults)).toBe(1);
  });
});

describe('partTransform', () => {
  const joints = solveJoints(catModel, defaults);

  it('stretches segments between their two joints', () => {
    const torso = catModel.parts.find((p) => p.id === 'torso')!;
    const t = partTransform(torso, joints, defaults);
    const dist = len(sub(joints.chest, joints.pelvis));
    expect(t.scale[1]).toBeCloseTo(dist / 2, 6); // extend = 0 for the torso
    expect(t.position[2]).toBeCloseTo((joints.chest[2] + joints.pelvis[2]) / 2, 6);
  });

  it('produces an orthonormal basis', () => {
    for (const part of catModel.parts) {
      const [x, y, z] = partTransform(part, joints, defaults).axes;
      expect(len(x)).toBeCloseTo(1, 6);
      expect(len(y)).toBeCloseTo(1, 6);
      expect(len(z)).toBeCloseTo(1, 6);
      expect(dot(x, y)).toBeCloseTo(0, 6);
      expect(dot(y, z)).toBeCloseTo(0, 6);
      expect(dot(x, z)).toBeCloseTo(0, 6);
    }
  });

  it('follows a posed joint (leg segment re-orients and stretches)', () => {
    const posed = solveJoints(catModel, defaults, { frontPawL: [0, 0.1, 0.1] });
    const lower = catModel.parts.find((p) => p.id === 'frontLowerL')!;
    const before = partTransform(lower, joints, defaults);
    const after = partTransform(lower, posed, defaults);
    expect(after.axes[1]).not.toEqual(before.axes[1]);
    expect(after.scale[1]).not.toBeCloseTo(before.scale[1], 3);
  });

  it('widens the front leg with the slider', () => {
    const thin = partTransform(catModel.parts.find((p) => p.id === 'frontUpperL')!, joints, defaults);
    const wide = partTransform(catModel.parts.find((p) => p.id === 'frontUpperL')!, joints, { ...defaults, frontLegWidth: 2 });
    expect(wide.scale[0] / thin.scale[0]).toBeCloseTo(2, 6);
  });

  it('mirrors left and right parts across x = 0', () => {
    const l = partTransform(catModel.parts.find((p) => p.id === 'eyeL')!, joints, defaults);
    const r = partTransform(catModel.parts.find((p) => p.id === 'eyeR')!, joints, defaults);
    expect(l.position[0]).toBeCloseTo(-r.position[0], 6);
    expect(l.position[1]).toBeCloseTo(r.position[1], 6);
  });
});

describe('ear fold', () => {
  // The fold swings the tip about the hinge, so measure the folding part of the ear (hinge -> tip).
  const tipOffset = (earFold: number, side: 'L' | 'R' = 'L') => {
    const params = { ...defaults, earFold };
    const j = solveJoints(catModel, params);
    return sub(j[`earTip${side}`], j[`earHinge${side}`]);
  };

  it('is upright by default', () => {
    expect(catModel.sliders.find((s) => s.id === 'earFold')!.default).toBe(0);
    expect(tipOffset(0)[1]).toBeGreaterThan(0.05);
  });

  it('keeps the ear length at every angle', () => {
    for (const f of [0.25, 0.5, 1, 1.5]) expect(len(tipOffset(f))).toBeCloseTo(len(tipOffset(0)), 9);
  });

  it('is roughly horizontal at 90° and below the base when hanging down, pointing outwards', () => {
    expect(Math.abs(tipOffset(1)[1])).toBeLessThan(0.1 * len(tipOffset(1))); // the upright ear leans a little, so not exactly 0
    expect(tipOffset(1.5)[1]).toBeLessThan(0);
    expect(tipOffset(1)[0]).toBeGreaterThan(0.05); // left ear falls to the left (+X)
    expect(tipOffset(1, 'R')[0]).toBeLessThan(-0.05);
  });

  it('mirrors left and right and leaves the base and head alone', () => {
    const a = tipOffset(1, 'L');
    const b = tipOffset(1, 'R');
    expect(a[0]).toBeCloseTo(-b[0], 9);
    expect(a[1]).toBeCloseTo(b[1], 9);
    expect(a[2]).toBeCloseTo(b[2], 9);
    const up = solveJoints(catModel, defaults);
    const folded = solveJoints(catModel, { ...defaults, earFold: 1 });
    for (const id of ['head', 'earBaseL', 'earBaseR', 'earHingeL', 'earHingeR', 'nose']) expect(folded[id]).toEqual(up[id]);
  });
});

describe('ear fold position', () => {
  const hingeFraction = (earFoldPos: number, side: 'L' | 'R' = 'L') => {
    const j = solveJoints(catModel, { ...defaults, earFoldPos });
    const whole = sub(j[`earTip${side}`], j[`earBase${side}`]);
    return sub(j[`earHinge${side}`], j[`earBase${side}`]).map((c, i) => c / whole[i]);
  };

  it('is a plain 0–1 position, halfway by default (no × suffix in the panel)', () => {
    const slider = catModel.sliders.find((s) => s.id === 'earFoldPos')!;
    expect(slider).toMatchObject({ min: 0, max: 1, default: 0.5, unit: '' });
  });

  it('puts the hinge at the root for 0, the tip for 1, and the middle at 0.5', () => {
    expect(hingeFraction(0)[1]).toBeCloseTo(0, 9);
    expect(hingeFraction(1)[1]).toBeCloseTo(1, 9);
    expect(hingeFraction(0.5)[1]).toBeCloseTo(0.5, 9);
  });

  it('moves the hinge monotonically from root to tip', () => {
    const fractions = [0, 0.25, 0.5, 0.75, 1].map((t) => hingeFraction(t)[1]);
    for (let i = 1; i < fractions.length; i++) expect(fractions[i]).toBeGreaterThan(fractions[i - 1]);
  });

  it('keeps the total ear length for every position and fold angle', () => {
    // Base -> hinge plus hinge -> tip; folding turns the second half but must not shorten it.
    const length = (earFoldPos: number, earFold: number) => {
      const j = solveJoints(catModel, { ...defaults, earFoldPos, earFold });
      return len(sub(j.earHingeL, j.earBaseL)) + len(sub(j.earTipL, j.earHingeL));
    };
    const reference = length(0.5, 0);
    for (const t of [0, 0.3, 1]) for (const f of [0, 1, 1.5]) expect(length(t, f)).toBeCloseTo(reference, 9);
  });
});

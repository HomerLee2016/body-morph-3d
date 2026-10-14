import { describe, expect, it } from 'vitest';
import { catModel } from '../src/models/cat';
import { defaultParams, solveJoints, validateModel } from '../src/core/rig';
import { partTransform } from '../src/core/parts';
import type { JointDef, ModelDef, SegmentPart, BlobPart } from '../src/core/types';
import { dot, len, sub } from '../src/core/vec';

const defaults = defaultParams(catModel);
const sliderValues = (which: 'min' | 'max') => Object.fromEntries(catModel.sliders.map((s) => [s.id, s[which]]));

const descendants = (id: string): string[] => {
  const kids = catModel.joints.filter((j) => j.parent === id).map((j) => j.id);
  return kids.flatMap((k) => [k, ...descendants(k)]);
};

describe('every slider', () => {
  for (const slider of catModel.sliders) {
    it(`${slider.id}: stays valid at its min and max`, () => {
      for (const value of [slider.min, slider.max]) {
        const params = { ...defaults, [slider.id]: value };
        const joints = solveJoints(catModel, params);
        for (const pos of Object.values(joints)) for (const c of pos) expect(Number.isFinite(c)).toBe(true);
        for (const part of catModel.parts) {
          const t = partTransform(part, joints, params);
          for (const c of [...t.position, ...t.scale]) expect(Number.isFinite(c)).toBe(true);
          for (const s of t.scale) expect(s).toBeGreaterThan(0);
        }
      }
    });

    // The size slider is applied by the viewer via modelScale() (covered in rig.test.ts), not by the solver.
    const solverDriven = slider.id !== catModel.sizeParam;
    it.runIf(solverDriven)(`${slider.id}: changes the model (is wired to a joint, part, skin or fur)`, () => {
      const lo = { ...defaults, [slider.id]: slider.min };
      const hi = { ...defaults, [slider.id]: slider.max };
      const jointsLo = solveJoints(catModel, lo);
      const jointsHi = solveJoints(catModel, hi);
      // Skin and fur sliders don't move joints or parts; they change what the skin and fur are made of.
      const look = (p: typeof lo) => [
        catModel.skin?.smoothness(p), catModel.skin?.thickness(p),
        catModel.fur?.density(p), catModel.fur?.length(p), catModel.fur?.thickness(p), catModel.fur?.messiness(p),
      ];
      const signature = (p: typeof lo, j: typeof jointsLo) =>
        JSON.stringify([catModel.parts.map((part) => partTransform(part, j, p)), j, look(p)]);
      expect(signature(lo, jointsLo)).not.toBe(signature(hi, jointsHi));
    });
  }
});

describe('extreme shapes', () => {
  it('keeps the paws on the ground at all-min and all-max', () => {
    for (const which of ['min', 'max'] as const) {
      const joints = solveJoints(catModel, sliderValues(which));
      const lowest = Math.min(...catModel.groundJoints.map((id) => joints[id][1]));
      expect(lowest).toBeCloseTo(catModel.groundClearance, 6);
    }
  });
});

describe('pose propagation', () => {
  const base = solveJoints(catModel, defaults);
  const delta: [number, number, number] = [0.05, 0.1, -0.02];

  for (const joint of catModel.joints) {
    it(`moving ${joint.id} moves exactly its subtree`, () => {
      const moved = solveJoints(catModel, defaults, { [joint.id]: delta });
      const subtree = new Set([joint.id, ...descendants(joint.id)]);
      for (const other of catModel.joints) {
        const shift = sub(moved[other.id], base[other.id]);
        if (subtree.has(other.id)) {
          expect(shift[0]).toBeCloseTo(delta[0], 9);
          expect(shift[1]).toBeCloseTo(delta[1], 9);
          expect(shift[2]).toBeCloseTo(delta[2], 9);
        } else {
          expect(len(shift)).toBeCloseTo(0, 9);
        }
      }
    });
  }

  it('accumulates offsets from several joints', () => {
    const moved = solveJoints(catModel, defaults, { chest: [0, 0.1, 0], head: [0.02, 0, 0] });
    expect(moved.head[0] - base.head[0]).toBeCloseTo(0.02, 9);
    expect(moved.head[1] - base.head[1]).toBeCloseTo(0.1, 9);
    expect(moved.nose[0] - base.nose[0]).toBeCloseTo(0.02, 9);
  });

  it('applies the same pose offset on top of any shape', () => {
    const shaped = { ...defaults, frontLegLength: 1.7, neckLength: 2 };
    const a = solveJoints(catModel, shaped);
    const b = solveJoints(catModel, shaped, { head: delta });
    const shift = sub(b.head, a.head);
    delta.forEach((d, i) => expect(shift[i]).toBeCloseTo(d, 9));
  });
});

describe('model symmetry', () => {
  it('mirrors every left joint onto the right across x = 0', () => {
    const joints = solveJoints(catModel, defaults);
    const left = catModel.joints.filter((j) => j.id.endsWith('L'));
    expect(left.length).toBeGreaterThan(0);
    for (const l of left) {
      const r = joints[l.id.slice(0, -1) + 'R'];
      expect(r, `${l.id} has a right counterpart`).toBeDefined();
      expect(joints[l.id][0]).toBeCloseTo(-r[0], 9);
      expect(joints[l.id][1]).toBeCloseTo(r[1], 9);
      expect(joints[l.id][2]).toBeCloseTo(r[2], 9);
    }
  });

  it('keeps midline joints on x = 0', () => {
    const joints = solveJoints(catModel, defaults);
    for (const id of ['pelvis', 'chest', 'neck', 'head', 'nose', 'tail1', 'tail4']) expect(joints[id][0]).toBeCloseTo(0, 9);
  });

  it('has the same number of left and right parts', () => {
    const count = (suffix: string) => catModel.parts.filter((p) => p.id.endsWith(suffix)).length;
    expect(count('L')).toBe(count('R'));
  });
});

describe('cat anatomy at defaults', () => {
  const joints = solveJoints(catModel, defaults);

  it('faces +Z: nose ahead of the head, head ahead of the pelvis, tail behind', () => {
    expect(joints.nose[2]).toBeGreaterThan(joints.head[2]);
    expect(joints.head[2]).toBeGreaterThan(joints.pelvis[2]);
    expect(joints.tail4[2]).toBeLessThan(joints.pelvis[2]);
  });

  it('stands upright: head above the chest, paws below the hips', () => {
    expect(joints.head[1]).toBeGreaterThan(joints.chest[1]);
    expect(joints.frontPawL[1]).toBeLessThan(joints.shoulderL[1]);
    expect(joints.hindPawL[1]).toBeLessThan(joints.hipL[1]);
  });

  it('has every part referencing real joints and a valid colour', () => {
    const ids = new Set(catModel.joints.map((j) => j.id));
    for (const part of catModel.parts) {
      const refs = part.kind === 'segment' ? [part.from, part.to] : [part.at];
      for (const r of refs) expect(ids.has(r)).toBe(true);
      expect(part.color).toBeGreaterThanOrEqual(0);
      expect(part.color).toBeLessThanOrEqual(0xffffff);
    }
  });

  it('has unique part ids', () => {
    const ids = catModel.parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('groups sliders into the sections the panel shows', () => {
    const groups = new Set(catModel.sliders.map((s) => s.group));
    for (const g of ['Head', 'Ears', 'Neck', 'Body', 'Front legs', 'Hind legs', 'Tail']) expect(groups.has(g)).toBe(true);
  });
});

describe('validateModel errors', () => {
  const joint = (id: string, parent: string | null): JointDef => ({ id, label: id, parent, pos: [0, 0, 0] });
  const tiny = (over: Partial<ModelDef> = {}): ModelDef => ({
    id: 't', name: 't', joints: [joint('a', null), joint('b', 'a')], parts: [], sliders: [], groundJoints: ['b'], groundClearance: 0, ...over,
  });

  it('accepts a minimal valid model', () => {
    expect(() => validateModel(tiny())).not.toThrow();
  });

  it('rejects duplicate joint ids', () => {
    expect(() => validateModel(tiny({ joints: [joint('a', null), joint('a', 'a')] }))).toThrow(/Duplicate/);
  });

  it('rejects a missing parent', () => {
    expect(() => validateModel(tiny({ joints: [joint('a', null), joint('b', 'nope')] }))).toThrow(/parent/);
  });

  it('rejects zero or multiple roots', () => {
    expect(() => validateModel(tiny({ joints: [joint('a', null), joint('b', null)] }))).toThrow(/root/);
  });

  it('rejects unknown ground joints', () => {
    expect(() => validateModel(tiny({ groundJoints: ['zzz'] }))).toThrow(/ground/);
  });

  it('rejects parts that reference unknown joints', () => {
    const segment: SegmentPart = { kind: 'segment', id: 's', from: 'a', to: 'zzz', shape: 'ellipsoid', radii: () => [1, 1], color: 0 };
    const blob: BlobPart = { kind: 'blob', id: 'b', at: 'a', facing: { from: 'a', to: 'zzz' }, radii: () => [1, 1, 1], color: 0 };
    expect(() => validateModel(tiny({ parts: [segment] }))).toThrow(/zzz/);
    expect(() => validateModel(tiny({ parts: [blob] }))).toThrow(/zzz/);
  });
});

describe('partTransform shapes', () => {
  const joints = solveJoints(catModel, defaults);

  it('cones span exactly from -> to (base on `from`)', () => {
    const ear = catModel.parts.find((p) => p.id === 'earL') as SegmentPart;
    const t = partTransform(ear, joints, defaults);
    expect(t.scale[1]).toBeCloseTo(len(sub(joints.earTipL, joints.earBaseL)), 9);
    const [, y] = t.axes;
    const expectedDir = sub(joints.earTipL, joints.earBaseL);
    expect(dot(y, expectedDir) / len(expectedDir)).toBeCloseTo(1, 9);
  });

  it('blobs face along their facing axis (head blob points at the nose)', () => {
    const head = catModel.parts.find((p) => p.id === 'head') as BlobPart;
    const [, , z] = partTransform(head, joints, defaults).axes;
    const dir = sub(joints.nose, joints.head);
    expect(dot(z, dir) / len(dir)).toBeCloseTo(1, 9);
  });

  it('a lerped blob sits between its two joints', () => {
    const snout = catModel.parts.find((p) => p.id === 'snout') as BlobPart;
    const { position } = partTransform(snout, joints, defaults);
    expect(position[2]).toBeGreaterThan(joints.head[2]);
    expect(position[2]).toBeLessThan(joints.nose[2] + 0.2);
  });

  it('applies blob offsets in the local frame (eyes are lateral, in front of the head centre)', () => {
    const eyeL = partTransform(catModel.parts.find((p) => p.id === 'eyeL') as BlobPart, joints, defaults);
    const eyeR = partTransform(catModel.parts.find((p) => p.id === 'eyeR') as BlobPart, joints, defaults);
    expect(eyeL.position[0]).toBeGreaterThan(0);
    expect(eyeR.position[0]).toBeLessThan(0);
    expect(eyeL.position[2]).toBeGreaterThan(joints.head[2]);
  });

  it('keeps default segment caps at 0.6 x the largest radius', () => {
    const tail = catModel.parts.find((p) => p.id === 'tail1') as SegmentPart;
    const t = partTransform(tail, joints, defaults);
    const dist = len(sub(joints.tail2, joints.tail1));
    const r = Math.max(...tail.radii(defaults));
    expect(t.scale[1]).toBeCloseTo(dist / 2 + 0.6 * r, 9);
  });

  it('orients a vertical leg without degeneracy (finite, orthonormal basis)', () => {
    const leg = catModel.parts.find((p) => p.id === 'frontLowerL')!;
    const [x, y, z] = partTransform(leg, joints, defaults).axes;
    expect(Math.abs(y[1])).toBeGreaterThan(0.9);
    expect(len(x)).toBeCloseTo(1, 9);
    expect(len(z)).toBeCloseTo(1, 9);
  });

  it('survives a zero-length segment (joints on top of each other)', () => {
    const collapsed = solveJoints(catModel, defaults, { frontPawL: sub(joints.elbowL, joints.frontPawL) });
    const leg = catModel.parts.find((p) => p.id === 'frontLowerL')!;
    const t = partTransform(leg, collapsed, defaults);
    for (const v of [...t.position, ...t.scale, ...t.axes.flat()]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('ears', () => {
  // The base rim of each ear must lie inside the head, so the ear grows out of it instead of hanging off its side.
  const rimInsideHead = (params: Record<string, number>, side: 'L' | 'R'): number => {
    const joints = solveJoints(catModel, params);
    const ear = catModel.parts.find((p) => p.id === `ear${side}`) as SegmentPart;
    const head = partTransform(catModel.parts.find((p) => p.id === 'head')!, joints, params);
    const t = partTransform(ear, joints, params);
    const base = joints[`earBase${side}`];
    let worst = 0;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rim = [0, 1, 2].map((c) => base[c] + t.axes[0][c] * t.scale[0] * Math.cos(a) + t.axes[2][c] * t.scale[2] * Math.sin(a)) as [number, number, number];
      const d = sub(rim, head.position);
      const n = [0, 1, 2].reduce((sum, k) => sum + (dot(d, head.axes[k]) / head.scale[k]) ** 2, 0);
      worst = Math.max(worst, n);
    }
    return worst; // <= 1 means inside the head ellipsoid
  };

  for (const [name, overrides] of [
    ['default', {}],
    ['narrow head', { headWidth: 0.6 }],
    ['wide head', { headWidth: 1.6 }],
    ['small head', { headSize: 0.6 }],
    ['big head', { headSize: 1.8 }],
    ['short ears', { earLength: 0.4 }],
    ['long ears', { earLength: 2.6 }],
  ] as const) {
    it(`ear bases stay inside the head: ${name}`, () => {
      for (const side of ['L', 'R'] as const) expect(rimInsideHead({ ...defaults, ...overrides }, side)).toBeLessThanOrEqual(1);
    });
  }

  it('the ear tips clear the top of the head so the ears are visible', () => {
    const joints = solveJoints(catModel, defaults);
    const head = partTransform(catModel.parts.find((p) => p.id === 'head')!, joints, defaults);
    for (const side of ['L', 'R'] as const) expect(joints[`earTip${side}`][1]).toBeGreaterThan(head.position[1] + head.scale[1] + 0.03);
  });
});

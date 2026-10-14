import { describe, expect, it } from 'vitest';
import { catModel } from '../src/models/cat';
import { poseFromDisplacements } from '../src/core/pose';
import { defaultParams, solveJoints } from '../src/core/rig';

const defaults = defaultParams(catModel);
const jointIds = new Set(catModel.joints.map((j) => j.id));

describe('poseFromDisplacements', () => {
  it('stores each listed joint its own displacement', () => {
    const model = { ...catModel, poses: [] };
    const pose = poseFromDisplacements(model, { pelvis: [0, 0.1, 0], chest: [0, 0.3, 0] });
    expect(pose.pelvis).toEqual([0, 0.1, 0]);
    expect(pose.chest).toEqual([0, 0.3, 0]);
  });

  it('gives an unlisted joint its parent displacement, so presets move whole limbs', () => {
    const model = { ...catModel, poses: [] };
    const pose = poseFromDisplacements(model, { chest: [0, 0.3, 0] });
    expect(pose.head).toEqual([0, 0.3, 0]);
    expect(pose.shoulderL).toEqual([0, 0.3, 0]);
    expect(pose.pelvis).toBeUndefined();
  });

  it('lands each joint at its requested displacement in the solved skeleton', () => {
    const base = solveJoints(catModel, defaults);
    const posed = solveJoints(catModel, defaults, poseFromDisplacements(catModel, { head: [0, 0.05, 0.02] }));
    expect(posed.head[1] - base.head[1]).toBeCloseTo(0.05, 9);
    expect(posed.head[2] - base.head[2]).toBeCloseTo(0.02, 9);
  });
});

describe('cat pose presets', () => {
  const poses = catModel.poses ?? [];

  it('defines the standard poses with unique ids', () => {
    const ids = poses.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['sit', 'maneki', 'wave', 'jump', 'lick', 'eat', 'guard']));
  });

  it('only references known joints', () => {
    for (const p of poses) for (const id of Object.keys(p.displace)) expect(jointIds.has(id)).toBe(true);
  });

  it('keeps every joint finite and above the floor', () => {
    for (const p of poses) {
      const joints = solveJoints(catModel, defaults, poseFromDisplacements(catModel, p.displace));
      for (const [id, pos] of Object.entries(joints)) {
        for (const c of pos) expect(Number.isFinite(c), `${p.id}/${id}`).toBe(true);
        expect(pos[1], `${p.id}/${id} sinks below the floor`).toBeGreaterThanOrEqual(-1e-6);
      }
    }
  });
});

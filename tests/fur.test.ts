import { describe, expect, it } from 'vitest';
import { catModel } from '../src/models/cat';
import { defaultParams, solveJoints } from '../src/core/rig';
import { MAX_HAIRS, hash01, scatterFur, type FurSettings } from '../src/core/fur';
import { collectSkinParts, createSkinField, hexToLinear, type SkinPart } from '../src/core/skin';
import type { PartTransform } from '../src/core/types';
import { len, type Vec3 } from '../src/core/vec';

const AXES: PartTransform['axes'] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const ball = (id: string, r: number, at: Vec3 = [0, 0, 0]): SkinPart => ({
  id, shape: 'ellipsoid', color: hexToLinear(0xd98a3d), transform: { position: at, axes: AXES, scale: [r, r, r] },
});
const SETTINGS: FurSettings = { density: 4, length: 0.02, messiness: 0 };
const at = (a: Float32Array, i: number): Vec3 => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];

describe('hash01', () => {
  it('is deterministic and within [0, 1)', () => {
    expect(hash01(3, 7, 1)).toBe(hash01(3, 7, 1));
    expect(hash01(3, 7, 1)).not.toBe(hash01(3, 7, 2));
    for (let i = 0; i < 1000; i++) {
      const v = hash01(i, i * 3, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('scatterFur on a sphere', () => {
  const R = 0.1;
  const field = createSkinField([ball('a', R)], 0, 0.003);
  const fur = scatterFur(field, SETTINGS);

  it('puts about `density` hairs on each cm² of the skin', () => {
    const skinArea = 4 * Math.PI * (R + 0.003) ** 2 * 1e4; // cm²
    const expected = SETTINGS.density * 4 * Math.PI * R * R * 1e4; // grown from the part surface
    expect(fur.count).toBeGreaterThan(expected * 0.9);
    expect(fur.count).toBeLessThan(expected * 1.1);
    expect(expected).toBeLessThan(skinArea * SETTINGS.density);
  });

  it('roots every hair on the skin and grows it straight out', () => {
    for (let i = 0; i < fur.count; i++) {
      const p = at(fur.roots, i);
      expect(Math.abs(field.value(p))).toBeLessThan(0.002);
      expect(len(p)).toBeCloseTo(R + 0.003, 2);
      const d = at(fur.directions, i);
      expect(len(d)).toBeCloseTo(1, 4);
      expect((d[0] * p[0] + d[1] * p[1] + d[2] * p[2]) / len(p)).toBeGreaterThan(0.98);
    }
  });

  it('varies strand length around the setting', () => {
    const lengths = Array.from(fur.lengths);
    expect(Math.min(...lengths)).toBeGreaterThanOrEqual(SETTINGS.length * 0.75 - 1e-9);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(SETTINGS.length * 1.25 + 1e-9);
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeGreaterThan(SETTINGS.length * 0.3);
  });

  it('scales with density', () => {
    const double = scatterFur(field, { ...SETTINGS, density: 8 });
    expect(double.count / fur.count).toBeGreaterThan(1.9);
    expect(double.count / fur.count).toBeLessThan(2.1);
  });

  it('is empty at zero density, zero length or zero share', () => {
    expect(scatterFur(field, { ...SETTINGS, density: 0 }).count).toBe(0);
    expect(scatterFur(field, { ...SETTINGS, length: 0 }).count).toBe(0);
    expect(scatterFur(field, SETTINGS, 0).count).toBe(0);
  });

  it('is deterministic', () => {
    const again = scatterFur(field, SETTINGS);
    expect(again.count).toBe(fur.count);
    expect(Array.from(again.roots)).toEqual(Array.from(fur.roots));
  });

  it('a share is a subset of the full coat', () => {
    const quarter = scatterFur(field, SETTINGS, 0.25);
    expect(quarter.count / fur.count).toBeGreaterThan(0.2);
    expect(quarter.count / fur.count).toBeLessThan(0.3);
    for (let i = 0; i < quarter.count; i++) expect(at(quarter.roots, i)).toEqual(at(fur.roots, i));
  });

  it('messiness leans hairs away from the normal, but not inwards', () => {
    const messy = scatterFur(field, { ...SETTINGS, messiness: 1 });
    let total = 0;
    for (let i = 0; i < messy.count; i++) {
      const p = at(messy.roots, i);
      const d = at(messy.directions, i);
      const outward = (d[0] * p[0] + d[1] * p[1] + d[2] * p[2]) / len(p);
      total += outward;
      expect(outward).toBeGreaterThan(0.1);
    }
    expect(total / messy.count).toBeLessThan(0.95);
    expect(total / messy.count).toBeGreaterThan(0.6);
  });

  it('hairs stay with their part when the part grows a little', () => {
    const bigger = scatterFur(createSkinField([ball('a', R * 1.02)], 0, 0.003), SETTINGS);
    let moved = 0;
    const n = Math.min(bigger.count, fur.count, 500);
    for (let i = 0; i < n; i++) {
      const a = at(fur.roots, i);
      const b = at(bigger.roots, i);
      moved = Math.max(moved, len([a[0] - b[0], a[1] - b[1], a[2] - b[2]]));
    }
    expect(moved).toBeLessThan(0.01);
  });

  it('never exceeds the hair limit, however high the density', () => {
    const dense = scatterFur(field, { ...SETTINGS, density: 500 });
    expect(dense.count).toBeLessThanOrEqual(MAX_HAIRS);
    expect(dense.count).toBeGreaterThan(MAX_HAIRS * 0.3);
  });
});

describe('scatterFur coverage', () => {
  it('drops hairs buried inside a bigger part', () => {
    const alone = scatterFur(createSkinField([ball('big', 0.1)], 0, 0), SETTINGS);
    const buried = scatterFur(createSkinField([ball('big', 0.1), ball('small', 0.05)], 0, 0), SETTINGS);
    expect(buried.count).toBeLessThan(alone.count * 1.05);
  });

  it('grows hair on cones too', () => {
    const cone: SkinPart = {
      id: 'ear', shape: 'cone', color: hexToLinear(0xffffff),
      transform: { position: [0, 0, 0], axes: AXES, scale: [0.05, 0.1, 0.05] },
    };
    const field = createSkinField([cone], 0, 0);
    const fur = scatterFur(field, SETTINGS);
    expect(fur.count).toBeGreaterThan(100);
    for (let i = 0; i < fur.count; i++) expect(Math.abs(field.value(at(fur.roots, i)))).toBeLessThan(0.002);
  });

  it('keeps hair off parts that must stay clear', () => {
    const field = createSkinField([ball('head', 0.1)], 0, 0.003);
    const eye = createSkinField([ball('eye', 0.015, [0, 0, 0.1])], 0, 0);
    const fur = scatterFur(field, SETTINGS, 1, eye);
    const bare = scatterFur(field, SETTINGS);
    expect(fur.count).toBeLessThan(bare.count);
    for (let i = 0; i < fur.count; i++) expect(eye.partDistance(0, at(fur.roots, i))).toBeGreaterThanOrEqual(0.004);
  });

  it('colours hairs from the skin under them', () => {
    const fur = scatterFur(createSkinField([ball('a', 0.1)], 0, 0), SETTINGS);
    const base = hexToLinear(0xd98a3d);
    for (let i = 0; i < 50; i++) {
      const c = at(fur.colors, i);
      expect(c[0] / base[0]).toBeGreaterThan(0.87);
      expect(c[0] / base[0]).toBeLessThan(1.13);
    }
  });
});

describe('cat fur', () => {
  const params = defaultParams(catModel);
  const joints = solveJoints(catModel, params);
  const field = createSkinField(collectSkinParts(catModel, joints, params), catModel.skin!.smoothness(params), catModel.skin!.thickness(params));
  const detail = createSkinField(collectSkinParts(catModel, joints, params, true), 0, 0);
  const settings = (p: typeof params): FurSettings => ({ density: catModel.fur!.density(p), length: catModel.fur!.length(p), messiness: catModel.fur!.messiness(p) });

  it('covers the cat with thousands of hairs at the default settings', () => {
    const fur = scatterFur(field, settings(params), 1, detail);
    expect(fur.count).toBeGreaterThan(8000);
    expect(fur.count).toBeLessThan(MAX_HAIRS);
    for (const v of [...fur.roots, ...fur.directions, ...fur.lengths, ...fur.colors]) expect(Number.isFinite(v)).toBe(true);
  });

  it('leaves the eyes and nose bare', () => {
    const fur = scatterFur(field, settings(params), 1, detail);
    for (let i = 0; i < fur.count; i++) for (let j = 0; j < detail.parts.length; j++) expect(detail.partDistance(j, at(fur.roots, i))).toBeGreaterThan(0.0039);
  });

  it('thins the whole coat evenly when the hair limit is hit, instead of leaving the tail bare', () => {
    const fur = scatterFur(field, { ...settings(params), density: 40 }, 1, detail);
    expect(fur.count).toBe(MAX_HAIRS);
    const tip = joints.tail4;
    const nearTail = Array.from({ length: fur.count }, (_, i) => at(fur.roots, i)).filter((p) => len([p[0] - tip[0], p[1] - tip[1], p[2] - tip[2]]) < 0.1);
    expect(nearTail.length).toBeGreaterThan(500);
  });

  it('every fur slider changes the coat', () => {
    const base = scatterFur(field, settings(params), 1, detail);
    const signature = (f: typeof base) => JSON.stringify([f.count, Array.from(f.lengths.slice(0, 20)), Array.from(f.directions.slice(0, 60))]);
    for (const slider of catModel.sliders.filter((s) => s.group === 'Fur')) {
      for (const value of [slider.min, slider.max]) {
        const p = { ...params, [slider.id]: value };
        const fur = scatterFur(field, settings(p), 1, detail);
        const thickness = catModel.fur!.thickness(p);
        const changed = signature(fur) !== signature(base) || thickness !== catModel.fur!.thickness(params);
        expect(changed, `${slider.id}=${value}`).toBe(true);
      }
    }
  });
});

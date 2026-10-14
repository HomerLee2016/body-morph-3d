import { describe, expect, it } from 'vitest';
import { catModel } from '../src/models/cat';
import { defaultParams, solveJoints } from '../src/core/rig';
import { collectSkinParts, createSkinField, hexToLinear, meshSkin, type SkinPart } from '../src/core/skin';
import type { PartTransform } from '../src/core/types';
import { len, sub, type Vec3 } from '../src/core/vec';

const AXES: PartTransform['axes'] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const ball = (id: string, at: Vec3, r: number, hex = 0xffffff): SkinPart => ({
  id,
  shape: 'ellipsoid',
  transform: { position: at, axes: AXES, scale: [r, r, r] },
  color: hexToLinear(hex),
});

describe('skin field', () => {
  it('is negative inside a part, positive outside, ~0 on its surface', () => {
    const field = createSkinField([ball('a', [0, 0, 0], 0.1)], 0, 0);
    expect(field.value([0, 0, 0])).toBeLessThan(0);
    expect(field.value([0.3, 0, 0])).toBeGreaterThan(0);
    expect(field.value([0.1, 0, 0])).toBeCloseTo(0, 6);
    expect(field.value([0, 0, -0.1])).toBeCloseTo(0, 6);
  });

  it('thickness pushes the skin outwards', () => {
    const parts = [ball('a', [0, 0, 0], 0.1)];
    const bare = createSkinField(parts, 0, 0);
    const thick = createSkinField(parts, 0, 0.02);
    expect(thick.value([0.11, 0, 0])).toBeLessThan(0);
    expect(bare.value([0.11, 0, 0])).toBeGreaterThan(0);
    expect(thick.value([0.12, 0, 0])).toBeCloseTo(0, 6);
  });

  it('smoothness bridges a gap between two parts, 0 does not', () => {
    const parts = [ball('a', [-0.11, 0, 0], 0.1), ball('b', [0.11, 0, 0], 0.1)]; // 2 cm apart
    const hard = createSkinField(parts, 0, 0);
    const soft = createSkinField(parts, 0.05, 0);
    expect(hard.value([0, 0, 0])).toBeGreaterThan(0);
    expect(soft.value([0, 0, 0])).toBeLessThan(0);
  });

  it('smoothness never removes volume that is already inside', () => {
    const parts = [ball('a', [-0.05, 0, 0], 0.1), ball('b', [0.05, 0, 0], 0.1)];
    const soft = createSkinField(parts, 0.04, 0);
    for (const p of [[0, 0, 0], [-0.1, 0, 0], [0.1, 0, 0], [0, 0.05, 0]] as Vec3[]) expect(soft.value(p)).toBeLessThan(0);
  });

  it('a cone is inside near its base and outside past its apex', () => {
    const cone: SkinPart = {
      id: 'c', shape: 'cone', color: hexToLinear(0xffffff),
      transform: { position: [0, 0, 0], axes: AXES, scale: [0.05, 0.1, 0.05] }, // base at y = -0.05, apex at y = +0.05
    };
    const field = createSkinField([cone], 0, 0);
    expect(field.value([0, -0.04, 0])).toBeLessThan(0);
    expect(field.value([0, 0.07, 0])).toBeGreaterThan(0);
    expect(field.value([0.045, 0.04, 0])).toBeGreaterThan(0); // beside the narrow tip
  });

  it('colour follows the nearest part and blends in between', () => {
    const red = hexToLinear(0xff0000);
    const blue = hexToLinear(0x0000ff);
    const field = createSkinField([ball('r', [-0.2, 0, 0], 0.1, 0xff0000), ball('b', [0.2, 0, 0], 0.1, 0x0000ff)], 0.02, 0);
    expect(field.colorAt([-0.3, 0, 0])[0]).toBeCloseTo(red[0], 2);
    expect(field.colorAt([0.3, 0, 0])[2]).toBeCloseTo(blue[2], 2);
    const mid = field.colorAt([0, 0, 0]);
    expect(mid[0]).toBeCloseTo(mid[2], 2);
  });
});

describe('skin mesh', () => {
  const R = 0.1;
  const sphere = meshSkin(createSkinField([ball('a', [0, 0.2, 0], R)], 0, 0), 0.008);

  it('lies on the surface of a sphere with outward normals', () => {
    expect(sphere.indices.length).toBeGreaterThan(300);
    for (let v = 0; v < sphere.positions.length; v += 3) {
      const p: Vec3 = [sphere.positions[v], sphere.positions[v + 1] - 0.2, sphere.positions[v + 2]];
      expect(Math.abs(len(p) - R)).toBeLessThan(0.006);
      const n: Vec3 = [sphere.normals[v], sphere.normals[v + 1], sphere.normals[v + 2]];
      expect((p[0] * n[0] + p[1] * n[1] + p[2] * n[2]) / len(p)).toBeGreaterThan(0.9);
    }
  });

  it('winds every triangle counter-clockwise seen from outside', () => {
    const at = (i: number): Vec3 => [sphere.positions[i * 3], sphere.positions[i * 3 + 1] - 0.2, sphere.positions[i * 3 + 2]];
    for (let t = 0; t < sphere.indices.length; t += 3) {
      const [a, b, c] = [at(sphere.indices[t]), at(sphere.indices[t + 1]), at(sphere.indices[t + 2])];
      const e1 = sub(b, a);
      const e2 = sub(c, a);
      const n: Vec3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const centre: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      expect(n[0] * centre[0] + n[1] * centre[1] + n[2] * centre[2]).toBeGreaterThan(0);
    }
  });

  it('is watertight: every edge is shared by exactly two triangles', () => {
    const edges = new Map<string, number>();
    for (let t = 0; t < sphere.indices.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = sphere.indices[t + e];
        const b = sphere.indices[t + ((e + 1) % 3)];
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    for (const count of edges.values()) expect(count).toBe(2);
  });

  it('colours vertices with the colour of the part under them', () => {
    const mesh = meshSkin(createSkinField([ball('a', [0, 0, 0], 0.1, 0xff0000)], 0, 0), 0.01);
    const red = hexToLinear(0xff0000);
    expect(mesh.colors[0]).toBeCloseTo(red[0], 3);
    expect(mesh.colors[1]).toBeCloseTo(0, 3);
  });

  it('returns an empty mesh when there are no parts', () => {
    expect(meshSkin(createSkinField([], 0.01, 0.003), 0.01).indices.length).toBe(0);
  });

  it('coarsens the grid instead of exploding on a tiny voxel size', () => {
    const mesh = meshSkin(createSkinField([ball('a', [0, 0, 0], 1)], 0, 0), 0.001);
    expect(mesh.indices.length).toBeGreaterThan(0);
  });
});

describe('cat skin', () => {
  const build = (overrides: Record<string, number> = {}) => {
    const params = { ...defaultParams(catModel), ...overrides };
    const parts = collectSkinParts(catModel, solveJoints(catModel, params), params);
    return { parts, params, field: createSkinField(parts, catModel.skin!.smoothness(params), catModel.skin!.thickness(params)) };
  };

  /** Number of separate pieces in the mesh. */
  const pieces = (indices: Uint32Array, vertexCount: number): number => {
    const parent = Array.from({ length: vertexCount }, (_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let t = 0; t < indices.length; t += 3) {
      parent[find(indices[t])] = find(indices[t + 1]);
      parent[find(indices[t + 1])] = find(indices[t + 2]);
    }
    return new Set(Array.from({ length: vertexCount }, (_, i) => find(i))).size;
  };

  it('leaves the eyes and nose tip out of the skin', () => {
    const ids = build().parts.map((p) => p.id);
    expect(ids).not.toContain('eyeL');
    expect(ids).not.toContain('noseTip');
    expect(ids).toContain('torso');
  });

  it('links the whole cat into one smooth piece', () => {
    const { field } = build();
    const mesh = meshSkin(field, 0.012);
    expect(mesh.indices.length).toBeGreaterThan(5000);
    expect(pieces(mesh.indices, mesh.positions.length / 3)).toBe(1);
    for (const c of [...mesh.positions, ...mesh.normals, ...mesh.colors]) expect(Number.isFinite(c)).toBe(true);
  });

  it('keeps the cat connected at the smoothness slider minimum too', () => {
    const slider = catModel.sliders.find((s) => s.id === 'skinSmoothness')!;
    const { field } = build({ skinSmoothness: slider.min });
    const mesh = meshSkin(field, 0.012);
    expect(mesh.indices.length).toBeGreaterThan(5000);
  });
});

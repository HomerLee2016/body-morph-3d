import type { JointPositions } from './rig';
import { partColor, partTransform } from './parts';
import type { ModelDef, PartDef, PartTransform, ShapeParams } from './types';
import { add, mul, type Vec3 } from './vec';

/**
 * Skin: one smooth surface wrapped around the parts ("muscles").
 *
 * Every part has an approximate signed distance (negative inside). The parts
 * are merged with an exponential smooth-minimum, which rounds off the creases
 * where they meet, and the result is pushed outwards by the skin thickness.
 * The zero level of that field is the skin; {@link meshSkin} turns it into
 * triangles with naive surface nets.
 */

export interface SkinPart {
  id: string;
  shape: 'ellipsoid' | 'cone';
  transform: PartTransform;
  /** Linear RGB, 0..1. */
  color: Vec3;
  /** Joints the part is built on. Two parts blend only when they are connected by joints (see `adjacent`). */
  joints?: readonly string[];
  /** Direct parent and children of `joints`. Missing `joints` = the part blends with every part. */
  adjacent?: readonly string[];
}

export interface SkinField {
  readonly parts: readonly SkinPart[];
  readonly smoothness: number;
  readonly thickness: number;
  /** Beyond this distance from every part the field is simply "outside". */
  readonly margin: number;
  readonly bounds: { min: Vec3; max: Vec3 };
  /** Skin value at `p`: negative inside, 0 on the skin. `subset` limits it to some part indices. */
  value(p: Vec3, subset?: ArrayLike<number>): number;
  /** Distance of `p` to a single part's surface (approximate, negative inside). */
  partDistance(index: number, p: Vec3): number;
  /** Indices of the parts that can influence the box `[min, max]` grown by `pad`. */
  near(min: Vec3, max: Vec3, pad?: number): number[];
  /** Skin colour at `p` (linear RGB): the colours of the nearby parts, blended. `subset` limits it to some part indices. */
  colorAt(p: Vec3, subset?: ArrayLike<number>): Vec3;
}

export interface SkinMesh {
  positions: Float32Array;
  normals: Float32Array;
  /** Linear RGB per vertex. */
  colors: Float32Array;
  indices: Uint32Array;
}

const NO_COLOR: Vec3 = [0.6, 0.6, 0.6];
/** Colour transitions between muscles are at least this wide (metres), plus the smoothness. */
const COLOR_BLEND = 0.006;
/** Influence of a part is negligible beyond this many blend radii. */
const INFLUENCE = 6;
const MAX_NODES = 3_000_000;

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** `0xrrggbb` (sRGB) -> linear RGB. */
export function hexToLinear(hex: number): Vec3 {
  return [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
}

/**
 * Transforms of the parts that take part in the skin (those not marked `skin: false`), or with
 * `detail` the opposite set: the parts drawn as their own meshes (eyes, nose). Given the skin `field`,
 * the detail parts come out cleared of the skin (see {@link clearedTransform}).
 */
export function collectSkinParts(model: ModelDef, joints: JointPositions, params: ShapeParams, detail = false, field?: SkinField): SkinPart[] {
  const parentOf = new Map(model.joints.map((j) => [j.id, j.parent]));
  const adjacentTo = (ids: readonly string[]): string[] => {
    const out = new Set<string>();
    for (const id of ids) {
      const parent = parentOf.get(id);
      if (parent) out.add(parent);
      for (const j of model.joints) if (j.parent === id) out.add(j.id);
    }
    return [...out];
  };
  return model.parts
    .filter((part) => (part.skin === false) === detail)
    .map((part) => {
      const own = part.kind === 'segment' ? [part.from, part.to] : [part.at, ...(part.lerpTo ? [part.lerpTo.joint] : [])];
      return {
        id: part.id,
        shape: part.kind === 'segment' && part.shape === 'cone' ? ('cone' as const) : ('ellipsoid' as const),
        transform: detail && field ? clearedTransform(part, joints, params, field) : partTransform(part, joints, params),
        color: hexToLinear(partColor(part, params)),
        joints: own,
        adjacent: adjacentTo(own),
      };
    });
}

/**
 * Where a part drawn outside the skin (`skin: false`, e.g. an eye) goes: its rest position, pushed out
 * along the part's own facing (forward, for eyes and the nose) until it clears the skin. Without this, a
 * smoother or thicker skin grows over the eye and hides it.
 */
export function clearedTransform(part: PartDef, joints: JointPositions, params: ShapeParams, field: SkinField): PartTransform {
  const t = partTransform(part, joints, params);
  const [sx, sy, sz] = t.scale;
  return { ...t, position: liftOutOfSkin(field, t.position, t.axes[2], 0.5 * Math.min(sx, sy, sz)) };
}

/**
 * Moves `point` along `dir` until the field there is at least `margin` outside the skin. Each step closes the
 * part of the remaining gap (the field grows more slowly than the distance when `dir` is tilted off the normal), so
 * it takes a couple of dozen steps at worst.
 */
function liftOutOfSkin(field: SkinField, point: Vec3, dir: Vec3, margin: number): Vec3 {
  let p = point;
  for (let step = 0; step < 24; step++) {
    const gap = margin - field.value(p);
    if (gap <= 0) break;
    p = add(p, mul(dir, gap));
  }
  return p;
}

// Flat per-part record: centre (3), axes (9), scale (3), box min (3), box max (3).
const STRIDE = 21;

const overlaps = (a: readonly string[] = [], b: readonly string[] = []): boolean => a.some((id) => b.includes(id));

/** Two parts are linked when they share a joint, or a joint of one is a direct parent or child of a joint of the other. */
function linked(a: SkinPart, b: SkinPart): boolean {
  if (!a.joints || !b.joints) return true;
  return overlaps(a.joints, b.joints) || overlaps(a.joints, b.adjacent) || overlaps(b.joints, a.adjacent);
}

/** For each part, the indices of the parts it is linked to (itself included). */
function linkLists(parts: readonly SkinPart[]): number[][] {
  return parts.map((a, i) => parts.flatMap((b, j) => (i === j || linked(a, b) ? [j] : [])));
}

export function createSkinField(parts: readonly SkinPart[], smoothness: number, thickness: number): SkinField {
  const k = Math.max(0, smoothness);
  const offset = Math.max(0, thickness);
  const margin = INFLUENCE * k + offset + 1e-3;
  const n = parts.length;
  const data = new Float64Array(n * STRIDE);
  const isCone = new Uint8Array(n);
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];

  parts.forEach((part, i) => {
    const o = i * STRIDE;
    const { position, axes, scale } = part.transform;
    isCone[i] = part.shape === 'cone' ? 1 : 0;
    for (let a = 0; a < 3; a++) {
      data[o + a] = position[a];
      data[o + 3 + a] = axes[0][a];
      data[o + 6 + a] = axes[1][a];
      data[o + 9 + a] = axes[2][a];
      data[o + 12 + a] = scale[a];
    }
    // Conservative world box: sum of the projected half-extents (cones are half as tall as their scale).
    const half = [scale[0], isCone[i] ? scale[1] / 2 : scale[1], scale[2]];
    for (let a = 0; a < 3; a++) {
      const h = Math.abs(axes[0][a]) * half[0] + Math.abs(axes[1][a]) * half[1] + Math.abs(axes[2][a]) * half[2];
      data[o + 15 + a] = position[a] - h - margin;
      data[o + 18 + a] = position[a] + h + margin;
      lo[a] = Math.min(lo[a], data[o + 15 + a]);
      hi[a] = Math.max(hi[a], data[o + 18 + a]);
    }
  });

  const scratch = new Float64Array(n);
  const dist = new Float64Array(n);
  const inSet = new Uint8Array(n);
  const links = linkLists(parts);

  const distance = (i: number, x: number, y: number, z: number): number => {
    const o = i * STRIDE;
    const dx = x - data[o];
    const dy = y - data[o + 1];
    const dz = z - data[o + 2];
    const lx = dx * data[o + 3] + dy * data[o + 4] + dz * data[o + 5];
    const ly = dx * data[o + 6] + dy * data[o + 7] + dz * data[o + 8];
    const lz = dx * data[o + 9] + dy * data[o + 10] + dz * data[o + 11];
    const sx = data[o + 12];
    const sy = data[o + 13];
    const sz = data[o + 14];
    const ux = lx / sx;
    const uy = ly / sy;
    const uz = lz / sz;
    if (isCone[i]) {
      // Unit cone: base (radius 1) at uy = -0.5, apex at uy = +0.5. The slanted side is
      // f = |(ux, uz)| - (0.5 - uy); f / |grad f| (in metres) estimates the distance to it.
      const r = Math.max(Math.sqrt(ux * ux + uz * uz), 1e-6);
      const gx = ux / r / sx;
      const gz = uz / r / sz;
      const side = (r - (0.5 - uy)) / Math.sqrt(gx * gx + gz * gz + 1 / (sy * sy));
      const axial = (Math.abs(uy) - 0.5) * sy;
      return Math.max(side, axial);
    }
    // Ellipsoid distance estimate (Inigo Quilez): k0 (k0 - 1) / k1.
    const k0 = Math.sqrt(ux * ux + uy * uy + uz * uz);
    const k1 = Math.sqrt((ux * ux) / (sx * sx) + (uy * uy) / (sy * sy) + (uz * uz) / (sz * sz));
    const rmin = Math.min(sx, sy, sz);
    // Deep inside, the estimate depends on the direction and can run past the true depth; no
    // point of the ellipsoid is deeper than its smallest radius.
    return k1 < 1e-9 ? -rmin : Math.max((k0 * (k0 - 1)) / k1, -rmin);
  };

  const valueXYZ = (x: number, y: number, z: number, subset?: ArrayLike<number>): number => {
    const count = subset ? subset.length : n;
    if (count === 0) return margin;
    for (let t = 0; t < count; t++) {
      const i = subset ? subset[t] : t;
      dist[i] = distance(i, x, y, z);
      inSet[i] = 1;
    }
    // Each part is smooth-unioned only with the parts it is linked to; the field is the hard minimum over those.
    let best = Infinity;
    for (let t = 0; t < count; t++) {
      const i = subset ? subset[t] : t;
      if (k < 1e-6) {
        best = Math.min(best, dist[i]);
        continue;
      }
      const around = links[i];
      let min = Infinity;
      for (const j of around) if (inSet[j] && dist[j] < min) min = dist[j];
      let sum = 0;
      for (const j of around) if (inSet[j]) sum += Math.exp(-(dist[j] - min) / k);
      best = Math.min(best, min - k * Math.log(sum));
    }
    for (let t = 0; t < count; t++) inSet[subset ? subset[t] : t] = 0;
    return best - offset;
  };

  const near = (min: Vec3, max: Vec3, pad = 0): number[] => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      if (
        data[o + 18] + pad >= min[0] && data[o + 15] - pad <= max[0] &&
        data[o + 19] + pad >= min[1] && data[o + 16] - pad <= max[1] &&
        data[o + 20] + pad >= min[2] && data[o + 17] - pad <= max[2]
      ) out.push(i);
    }
    return out;
  };

  const colorAt = (p: Vec3, subset?: ArrayLike<number>): Vec3 => {
    const around = subset ?? near(p, p);
    if (around.length === 0) return NO_COLOR;
    const width = COLOR_BLEND + k;
    let min = Infinity;
    for (let t = 0; t < around.length; t++) {
      scratch[t] = distance(around[t], p[0], p[1], p[2]);
      min = Math.min(min, scratch[t]);
    }
    let r = 0, g = 0, b = 0, total = 0;
    for (let t = 0; t < around.length; t++) {
      const w = Math.exp(-(scratch[t] - min) / width);
      const c = parts[around[t]].color;
      r += c[0] * w; g += c[1] * w; b += c[2] * w; total += w;
    }
    return [r / total, g / total, b / total];
  };

  return {
    parts,
    smoothness: k,
    thickness: offset,
    margin,
    bounds: n === 0 ? { min: [0, 0, 0], max: [0, 0, 0] } : { min: lo, max: hi },
    value: (p, subset) => valueXYZ(p[0], p[1], p[2], subset),
    partDistance: (i, p) => distance(i, p[0], p[1], p[2]),
    near,
    colorAt,
  };
}

// --- Meshing (naive surface nets) -------------------------------------------

const BLOCK = 4;
const RELAX_ITERATIONS = 2;

// The 12 cube edges as pairs of corner indices (corner bit 0 = x, bit 1 = y, bit 2 = z).
const CUBE_EDGES: [number, number][] = [];
for (let c = 0; c < 8; c++) for (let bit = 0; bit < 3; bit++) if (!((c >> bit) & 1)) CUBE_EDGES.push([c, c | (1 << bit)]);

/**
 * Triangulate the skin. `voxel` is the grid spacing in metres (smaller = finer
 * and slower); it is coarsened automatically if the grid would get too big.
 */
export function meshSkin(field: SkinField, voxel: number): SkinMesh {
  const empty: SkinMesh = { positions: new Float32Array(0), normals: new Float32Array(0), colors: new Float32Array(0), indices: new Uint32Array(0) };
  if (field.parts.length === 0) return empty;

  const pad = voxel * 2;
  const origin: Vec3 = [field.bounds.min[0] - pad, field.bounds.min[1] - pad, field.bounds.min[2] - pad];
  const span: Vec3 = [field.bounds.max[0] + pad - origin[0], field.bounds.max[1] + pad - origin[1], field.bounds.max[2] + pad - origin[2]];
  let h = voxel;
  const dims = (): Vec3 => [Math.ceil(span[0] / h) + 1, Math.ceil(span[1] / h) + 1, Math.ceil(span[2] / h) + 1];
  let [nx, ny, nz] = dims();
  while (nx * ny * nz > MAX_NODES) {
    h *= 1.1;
    [nx, ny, nz] = dims();
  }

  // Sample the field. Probe each block at its corners and centre first: when they all agree on
  // inside/outside and are far from the surface, fill the block with the centre value and skip it.
  const strideY = nx;
  const strideZ = nx * ny;
  const values = new Float32Array(nx * ny * nz).fill(field.margin);
  const reach = (BLOCK - 1) * h * 0.87 + h; // half a block diagonal plus a cell
  for (let bz = 0; bz < nz; bz += BLOCK) {
    for (let by = 0; by < ny; by += BLOCK) {
      for (let bx = 0; bx < nx; bx += BLOCK) {
        const ex = Math.min(bx + BLOCK, nx);
        const ey = Math.min(by + BLOCK, ny);
        const ez = Math.min(bz + BLOCK, nz);
        const lo: Vec3 = [origin[0] + bx * h, origin[1] + by * h, origin[2] + bz * h];
        const hi: Vec3 = [origin[0] + (ex - 1) * h, origin[1] + (ey - 1) * h, origin[2] + (ez - 1) * h];
        const subset = field.near(lo, hi, 2 * h);
        if (subset.length === 0) continue;
        const centre = field.value([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], subset);
        let exact = Math.abs(centre) <= reach * 1.5;
        for (let c = 0; c < 8 && !exact; c++) {
          const v = field.value([c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]], subset);
          exact = v < 0 !== centre < 0 || Math.abs(v) <= reach * 1.5;
        }
        for (let k = bz; k < ez; k++) {
          for (let j = by; j < ey; j++) {
            for (let i = bx; i < ex; i++) {
              values[i + j * strideY + k * strideZ] = exact ? field.value([origin[0] + i * h, origin[1] + j * h, origin[2] + k * h], subset) : centre;
            }
          }
        }
      }
    }
  }

  // One vertex per cell the surface passes through.
  const cx = nx - 1;
  const cy = ny - 1;
  const cz = nz - 1;
  const cellVertex = new Int32Array(cx * cy * cz).fill(-1);
  const cornerOffset = Array.from({ length: 8 }, (_, c) => (c & 1) + ((c >> 1) & 1) * strideY + ((c >> 2) & 1) * strideZ);
  const pos: number[] = [];
  const nrm: number[] = [];
  const corner = new Float64Array(8);

  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        const base = i + j * strideY + k * strideZ;
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          corner[c] = values[base + cornerOffset[c]];
          if (corner[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;

        let ax = 0, ay = 0, az = 0, hits = 0;
        for (const [a, b] of CUBE_EDGES) {
          if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
          const t = corner[a] / (corner[a] - corner[b]);
          ax += (a & 1) + ((b & 1) - (a & 1)) * t;
          ay += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          az += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          hits++;
        }
        pos.push(origin[0] + (i + ax / hits) * h, origin[1] + (j + ay / hits) * h, origin[2] + (k + az / hits) * h);

        // Normal = field gradient from the cell corners.
        let gx = 0, gy = 0, gz = 0;
        for (let c = 0; c < 8; c++) {
          gx += (c & 1 ? 1 : -1) * corner[c];
          gy += (c & 2 ? 1 : -1) * corner[c];
          gz += (c & 4 ? 1 : -1) * corner[c];
        }
        const l = Math.hypot(gx, gy, gz) || 1;
        nrm.push(gx / l, gy / l, gz / l);
        cellVertex[i + j * cx + k * cx * cy] = pos.length / 3 - 1;
      }
    }
  }

  // One quad per grid edge the surface crosses, joining the four cells around it.
  const idx: number[] = [];
  const dim = [nx, ny, nz];
  const cellStride = [1, cx, cx * cy];
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const at = [i, j, k];
        const v0 = values[i + j * strideY + k * strideZ];
        for (let a = 0; a < 3; a++) {
          const u = (a + 1) % 3;
          const w = (a + 2) % 3;
          if (at[a] + 1 >= dim[a] || at[u] < 1 || at[w] < 1 || at[u] >= dim[u] - 1 || at[w] >= dim[w] - 1) continue;
          const v1 = values[i + j * strideY + k * strideZ + (a === 0 ? 1 : a === 1 ? strideY : strideZ)];
          if (v0 < 0 === v1 < 0) continue;
          const cell = at[0] * cellStride[0] + at[1] * cellStride[1] + at[2] * cellStride[2];
          const quad = [
            cell - cellStride[u] - cellStride[w],
            cell - cellStride[w],
            cell,
            cell - cellStride[u],
          ].map((c) => cellVertex[c]);
          if (quad.some((v) => v < 0)) continue;
          // Quad winds counter-clockwise seen from +axis; flip when the inside is on the far side.
          if (v0 < 0) idx.push(quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]);
          else idx.push(quad[0], quad[2], quad[1], quad[0], quad[3], quad[2]);
        }
      }
    }
  }

  const positions = new Float32Array(pos);
  relax(positions, idx, RELAX_ITERATIONS);
  const colors = new Float32Array(pos.length);
  for (let v = 0; v < pos.length; v += 3) {
    const c = field.colorAt([positions[v], positions[v + 1], positions[v + 2]]);
    colors[v] = c[0]; colors[v + 1] = c[1]; colors[v + 2] = c[2];
  }
  return { positions, normals: new Float32Array(nrm), colors, indices: new Uint32Array(idx) };
}

/**
 * Smooth out the grid staircase on thin features with Taubin smoothing (a
 * shrink step then a slightly bigger inflate step), which keeps the volume.
 */
function relax(positions: Float32Array, indices: ArrayLike<number>, iterations: number): void {
  const n = positions.length / 3;
  const start = new Uint32Array(n + 1);
  for (let t = 0; t < indices.length; t += 3) for (let e = 0; e < 3; e++) start[indices[t + e] + 1] += 2;
  for (let v = 0; v < n; v++) start[v + 1] += start[v];
  const fill = start.slice(0, n);
  const neighbours = new Uint32Array(start[n]);
  for (let t = 0; t < indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = indices[t + e];
      neighbours[fill[a]++] = indices[t + ((e + 1) % 3)];
      neighbours[fill[a]++] = indices[t + ((e + 2) % 3)];
    }
  }

  const next = new Float32Array(positions.length);
  for (let it = 0; it < iterations * 2; it++) {
    const factor = it % 2 === 0 ? 0.5 : -0.53;
    for (let v = 0; v < n; v++) {
      const from = start[v];
      const to = start[v + 1];
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let k = from; k < to; k++) sum += positions[neighbours[k] * 3 + c];
        const here = positions[v * 3 + c];
        next[v * 3 + c] = to > from ? here + factor * (sum / (to - from) - here) : here;
      }
    }
    positions.set(next);
  }
}

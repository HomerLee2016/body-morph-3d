import type { SkinField, SkinPart } from './skin';
import { normalize, type Vec3 } from './vec';

/**
 * Fur: hairs rooted on the skin.
 *
 * Hairs are scattered over each part's own surface, so a hair stays on "its"
 * muscle while sliders and the pose move things around. Each hair's random
 * numbers depend only on (part, hair number), so changing a slider nudges the
 * hairs instead of reshuffling them. Roots are then pushed outwards until they
 * meet the skin; hairs that end up buried inside another part are dropped.
 */

export interface FurSettings {
  /** Hairs per cm² of surface. */
  density: number;
  /** Strand length in metres. */
  length: number;
  /** Direction spread: 0 = straight out of the skin, 1 = very messy. */
  messiness: number;
  /** Shading contrast: 0 = flat colour, 1 = soft (default look), 2 = high contrast. */
  softness: number;
}

export interface Fur {
  count: number;
  /** Root positions, xyz per hair. */
  roots: Float32Array;
  /** Unit growth directions, xyz per hair. */
  directions: Float32Array;
  /** Strand lengths in metres. */
  lengths: Float32Array;
  /** Linear RGB per hair. */
  colors: Float32Array;
}

/** Upper limit on hairs (the density is turned down to stay under it). */
export const MAX_HAIRS = 100_000;

/** A hair rooted deeper than this inside a *different* part is hidden under it. */
const BURIED = 0.0015;
/** No hair is rooted closer than this to a part kept clear of fur (eyes, nose). */
const CLEARANCE = 0.004;
/** Root projection stops once it is this close to the skin. */
const ROOT_TOLERANCE = 3e-4;
/** Parts whose influence box is within this of a hair are considered when growing it. */
const NEIGHBOURHOOD = 0.01;
const GRADIENT_STEP = 5e-4;
/** How far a messy hair can lean away from the skin normal. */
const MESSY_LEAN = 0.8;
/** Root darkening at softness 1 (root brightness = 1 - this × softness). */
const ROOT_DARKENING = 0.18;
/** Per-hair brightness spread at softness 1 (± this). */
const TINT_SPREAD = 0.07;

/** Brightness of a strand's root relative to its tip, for a given softness. */
export const rootShade = (softness: number): number => 1 - ROOT_DARKENING * softness;

/** Deterministic hash of three integers to [0, 1). */
export function hash01(a: number, b: number, c: number): number {
  let h = Math.imul(a + 1, 374761393) ^ Math.imul(b + 1, 668265263) ^ Math.imul(c + 1, 2147483629);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** How many candidate points to draw for a part so that about `densityPerM2` survive per m². */
const candidateCount = (part: SkinPart, densityPerM2: number): number => {
  const [sx, sy, sz] = part.transform.scale;
  if (part.shape === 'cone') {
    const a = (sx + sz) / 2;
    return Math.PI * a * Math.sqrt(a * a + sy * sy) * densityPerM2;
  }
  // Candidates are drawn evenly over a unit sphere and thinned by rejection, which needs
  // 4π × (product of the two largest radii) of them per unit of surface density.
  const [, mid, large] = [sx, sy, sz].sort((p, q) => p - q);
  return 4 * Math.PI * mid * large * densityPerM2;
};

interface Sample {
  position: Vec3;
  normal: Vec3;
}

/** The `k`-th candidate point on a part's surface, or null if it was thinned out. */
function samplePart(part: SkinPart, index: number, k: number): Sample | null {
  const { position, axes, scale } = part.transform;
  const [sx, sy, sz] = scale;
  const toWorld = (l: Vec3): Vec3 => [
    axes[0][0] * l[0] + axes[1][0] * l[1] + axes[2][0] * l[2],
    axes[0][1] * l[0] + axes[1][1] * l[1] + axes[2][1] * l[2],
    axes[0][2] * l[0] + axes[1][2] * l[1] + axes[2][2] * l[2],
  ];
  const u1 = hash01(index, k, 0);
  const u2 = hash01(index, k, 1);

  if (part.shape === 'cone') {
    // Unit cone: apex at uy = +0.5, base radius 1 at uy = -0.5; area grows with distance from the apex.
    const s = Math.sqrt(u1);
    const angle = 2 * Math.PI * u2;
    const ux = s * Math.cos(angle);
    const uz = s * Math.sin(angle);
    const uy = 0.5 - s;
    const local: Vec3 = [ux * sx, uy * sy, uz * sz];
    const r = Math.max(s, 1e-6);
    const normal = normalize(toWorld([ux / r / sx, 1 / sy, uz / r / sz]));
    const p = toWorld(local);
    return { position: [position[0] + p[0], position[1] + p[1], position[2] + p[2]], normal };
  }

  const z = 2 * u1 - 1;
  const phi = 2 * Math.PI * u2;
  const ring = Math.sqrt(1 - z * z);
  const ux = ring * Math.cos(phi);
  const uy = ring * Math.sin(phi);
  const uz = z;
  const gx = ux / sx;
  const gy = uy / sy;
  const gz = uz / sz;
  const accept = Math.sqrt(gx * gx + gy * gy + gz * gz) * Math.min(sx, sy, sz);
  if (hash01(index, k, 2) > accept) return null;
  const p = toWorld([ux * sx, uy * sy, uz * sz]);
  return { position: [position[0] + p[0], position[1] + p[1], position[2] + p[2]], normal: normalize(toWorld([gx, gy, gz])) };
}

/**
 * Grow fur on `field`. `share` (0..1) keeps only the first part of each part's hairs: a cheap
 * preview that is a subset of the full coat. `keepClear` holds the parts that must stay bare.
 */
export function scatterFur(field: SkinField, settings: FurSettings, share = 1, keepClear?: SkinField): Fur {
  const empty: Fur = { count: 0, roots: new Float32Array(0), directions: new Float32Array(0), lengths: new Float32Array(0), colors: new Float32Array(0) };
  if (settings.density <= 0 || settings.length <= 0 || share <= 0) return empty;

  const perM2 = settings.density * 1e4;
  const wanted = field.parts.map((part) => Math.ceil(candidateCount(part, perM2) * share));
  const mostWanted = Math.max(...wanted);
  const cap = Math.min(MAX_HAIRS, wanted.reduce((a, b) => a + b, 0));
  const roots = new Float32Array(cap * 3);
  const directions = new Float32Array(cap * 3);
  const lengths = new Float32Array(cap);
  const colors = new Float32Array(cap * 3);
  let count = 0;

  // Hair number k of every part before hair k + 1 of any: if the limit is hit, the whole coat
  // thins out evenly instead of the last parts (tail, hind legs) going bald.
  for (let k = 0; k < mostWanted && count < cap; k++) {
    for (let i = 0; i < field.parts.length && count < cap; i++) {
      if (k >= wanted[i]) continue;
      const sample = samplePart(field.parts[i], i, k);
      if (!sample) continue;
      const { position: p0, normal: n0 } = sample;

      // Only the parts close to this hair matter.
      const around = field.near(p0, p0, NEIGHBOURHOOD);

      // Skip hairs that sit inside another part.
      let buried = false;
      for (const j of around) if (j !== i && field.partDistance(j, p0) < -BURIED) { buried = true; break; }
      if (buried) continue;

      // Slide outwards along the part normal until the skin is reached.
      let t = 0;
      let p: Vec3 = p0;
      let f = field.value(p, around);
      for (let step = 0; step < 5 && Math.abs(f) > ROOT_TOLERANCE; step++) {
        t -= f;
        p = [p0[0] + n0[0] * t, p0[1] + n0[1] * t, p0[2] + n0[2] * t];
        f = field.value(p, around);
      }
      if (Math.abs(f) > ROOT_TOLERANCE * 10) continue; // never reached the skin
      if (keepClear?.parts.some((_, j) => keepClear.partDistance(j, p) < CLEARANCE)) continue;

      // Grow along the skin normal (field gradient), leaning a little when messy.
      const h = GRADIENT_STEP;
      const gx = field.value([p[0] + h, p[1], p[2]], around) - f;
      const gy = field.value([p[0], p[1] + h, p[2]], around) - f;
      const gz = field.value([p[0], p[1], p[2] + h], around) - f;
      const normal = normalize([gx, gy, gz], n0);
      // Lean sideways only (never into the skin): strip the normal part of the random vector.
      const lean = settings.messiness * MESSY_LEAN;
      const rx = hash01(i, k, 3) * 2 - 1;
      const ry = hash01(i, k, 4) * 2 - 1;
      const rz = hash01(i, k, 5) * 2 - 1;
      const along = rx * normal[0] + ry * normal[1] + rz * normal[2];
      const dir = normalize(
        [normal[0] + (rx - along * normal[0]) * lean, normal[1] + (ry - along * normal[1]) * lean, normal[2] + (rz - along * normal[2]) * lean],
        normal,
      );

      const o = count * 3;
      roots[o] = p[0]; roots[o + 1] = p[1]; roots[o + 2] = p[2];
      directions[o] = dir[0]; directions[o + 1] = dir[1]; directions[o + 2] = dir[2];
      lengths[count] = settings.length * (0.75 + 0.5 * hash01(i, k, 6));
      const tint = 1 + (hash01(i, k, 7) - 0.5) * 2 * TINT_SPREAD * settings.softness;
      const color = field.colorAt(p, around);
      colors[o] = color[0] * tint; colors[o + 1] = color[1] * tint; colors[o + 2] = color[2] * tint;
      count++;
    }
  }

  return {
    count,
    roots: roots.subarray(0, count * 3),
    directions: directions.subarray(0, count * 3),
    lengths: lengths.subarray(0, count),
    colors: colors.subarray(0, count * 3),
  };
}

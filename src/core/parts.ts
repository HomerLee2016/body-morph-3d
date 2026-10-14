import type { BlobPart, PartDef, PartTransform, SegmentPart, ShapeParams } from './types';
import type { JointPositions } from './rig';
import { FORWARD, UP, add, cross, dot, len, lerp, mul, normalize, sub, type Vec3 } from './vec';

const DEFAULT_FACING = { from: 'pelvis', to: 'chest' };

/** Right-handed basis whose Y axis is `dir`; `ref` picks which way local X points. */
function basisFromY(dir: Vec3): [Vec3, Vec3, Vec3] {
  const y = normalize(dir);
  // Reference "forward" keeps ears/legs facing the same way; swap to "up" for
  // horizontal parts (torso) so local X stays lateral and local Z vertical.
  const ref = Math.abs(dot(y, FORWARD)) < 0.95 ? FORWARD : UP;
  const x = normalize(cross(ref, y), [1, 0, 0]);
  const z = cross(x, y);
  return [x, y, z];
}

/** Right-handed basis whose Z axis is `dir` and whose X axis stays horizontal. */
function basisFromZ(dir: Vec3): [Vec3, Vec3, Vec3] {
  const z = normalize(dir, FORWARD);
  const x = normalize(cross(UP, z), [1, 0, 0]);
  const y = cross(z, x);
  return [x, y, z];
}

function segmentTransform(part: SegmentPart, joints: JointPositions, params: ShapeParams): PartTransform {
  const a = joints[part.from];
  const b = joints[part.to];
  const [rx, rz] = part.radii(params);
  const axes = basisFromY(sub(b, a));
  const dist = len(sub(b, a));
  if (part.shape === 'cone') {
    // Unit cone: base at -0.5, apex at +0.5 along Y, so base sits on `from`.
    return { position: lerp(a, b, 0.5), axes, scale: [rx, dist, rz] };
  }
  const extend = part.extend ? part.extend(params) : Math.max(rx, rz) * 0.6;
  return { position: lerp(a, b, 0.5), axes, scale: [rx, dist / 2 + extend, rz] };
}

function blobTransform(part: BlobPart, joints: JointPositions, params: ShapeParams): PartTransform {
  const facing = part.facing ?? DEFAULT_FACING;
  const axes = basisFromZ(sub(joints[facing.to], joints[facing.from]));
  let position = joints[part.at];
  if (part.lerpTo) position = lerp(position, joints[part.lerpTo.joint], part.lerpTo.t);
  if (part.offset) {
    const [ox, oy, oz] = part.offset(params);
    position = add(position, add(add(mul(axes[0], ox), mul(axes[1], oy)), mul(axes[2], oz)));
  }
  return { position, axes, scale: part.radii(params) };
}

/** The part's colour (0xrrggbb) for the current params. */
export function partColor(part: PartDef, params: ShapeParams): number {
  return typeof part.color === 'function' ? part.color(params) : part.color;
}

export function partTransform(part: PartDef, joints: JointPositions, params: ShapeParams): PartTransform {
  return part.kind === 'segment' ? segmentTransform(part, joints, params) : blobTransform(part, joints, params);
}

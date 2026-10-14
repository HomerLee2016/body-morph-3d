import type { Vec3 } from './vec';

/** Slider id -> current value. Every slider is a multiplier (1 = default shape). */
export type ShapeParams = Record<string, number>;

/** Things the viewer can show or hide: the parts ("muscles"), the skin over them, the fur on the skin. */
export type LayerId = 'muscles' | 'skin' | 'fur';

/** Per-joint pose offset (model space), added on top of the rest position. */
export type Pose = Record<string, Vec3>;

export interface SliderDef {
  id: string;
  label: string;
  /** Panel section the slider is listed under. */
  group: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface JointDef {
  id: string;
  label: string;
  /** Parent joint id; `null` for the single root. Parents must be listed before children. */
  parent: string | null;
  /** Rest position in model space (metres, +Y up, +Z forward, ground at y = 0). */
  pos: Vec3;
  /** Scales the rest offset from the parent (e.g. a "neck length" slider). */
  scale?: (p: ShapeParams) => number | Vec3;
  /** Swings the (scaled) offset from the parent about `axis` by `angle` radians (e.g. folding an ear down). Length is kept. */
  rotate?: (p: ShapeParams) => { axis: Vec3; angle: number };
}

/** Ellipsoid (or cone) stretched between two joints. */
export interface SegmentPart {
  kind: 'segment';
  id: string;
  from: string;
  to: string;
  shape: 'ellipsoid' | 'cone';
  /** [lateral, vertical] cross-section radii. For cones this is the base. */
  radii: (p: ShapeParams) => [number, number];
  /** Extra half-length past each end (ellipsoids only). Default: 0.6 * max radius. */
  extend?: (p: ShapeParams) => number;
  color: number;
  /** `false` = drawn as its own mesh, not merged into the skin or covered in fur (eyes, nose). Default: true. */
  skin?: boolean;
}

/** Ellipsoid placed at a joint, oriented along `facing`. */
export interface BlobPart {
  kind: 'blob';
  id: string;
  at: string;
  /** Optionally slide the centre from `at` towards another joint by `t` (0..1). */
  lerpTo?: { joint: string; t: number };
  /** Local +Z axis points from `from` to `to`. Default: pelvis -> chest (body axis). */
  facing?: { from: string; to: string };
  /** [lateral, vertical, along-facing] radii. */
  radii: (p: ShapeParams) => Vec3;
  /** Offset in the blob's local frame (lateral, vertical, along-facing). */
  offset?: (p: ShapeParams) => Vec3;
  color: number;
  /** `false` = drawn as its own mesh, not merged into the skin or covered in fur (eyes, nose). Default: true. */
  skin?: boolean;
}

export type PartDef = SegmentPart | BlobPart;

/** Smooth surface wrapped around the parts ("muscles"). All lengths in metres. */
export interface SkinDef {
  /** Blend radius of the smooth union between parts. 0 = parts stay visibly separate. */
  smoothness: (p: ShapeParams) => number;
  /** How far the skin sits outside the parts. */
  thickness: (p: ShapeParams) => number;
}

/** Hairs rooted on the skin. All lengths in metres. */
export interface FurDef {
  /** Hairs per cm² of surface. */
  density: (p: ShapeParams) => number;
  /** Strand length. */
  length: (p: ShapeParams) => number;
  /** Strand width at the root. */
  thickness: (p: ShapeParams) => number;
  /** Random direction spread: 0 = combed straight out, 1 = very messy. */
  messiness: (p: ShapeParams) => number;
}

/**
 * Named pose. `displace` gives where each joint ends up relative to its rest position (model space).
 * Joints not listed follow their parent.
 */
export interface PosePreset {
  id: string;
  label: string;
  displace: Record<string, Vec3>;
}

export interface ModelDef {
  id: string;
  name: string;
  joints: JointDef[];
  parts: PartDef[];
  sliders: SliderDef[];
  /** Pose presets offered in the panel. */
  poses?: PosePreset[];
  /** Joints that should rest on the ground; the whole model is lifted so the lowest one sits at `groundClearance`. */
  groundJoints: string[];
  groundClearance: number;
  /** Slider id that uniformly scales the whole model. */
  sizeParam?: string;
  /** Smooth skin over the parts. Without it the parts are drawn as they are. */
  skin?: SkinDef;
  /** Fur on the skin. Needs `skin`. */
  fur?: FurDef;
}

export interface PartTransform {
  position: Vec3;
  /** Orthonormal basis (local X, Y, Z axes in model space). */
  axes: [Vec3, Vec3, Vec3];
  /** Radii along each local axis (unit sphere / cone geometry is scaled by this). */
  scale: Vec3;
}

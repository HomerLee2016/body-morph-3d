import type { JointDef, ModelDef, PartDef, ShapeParams, SliderDef } from '../core/types';
import type { Vec3 } from '../core/vec';

// Procedural cat: facing +Z, +Y up, +X is the cat's left, ground at y = 0.
// Rest positions are absolute; each joint's offset from its parent is what the
// shape sliders scale.

const FUR = 0xd98a3d;
const FUR_LIGHT = 0xf1dfbd;
const PINK = 0xe58b9c;
const EYE = 0x56c264;

const sliders: SliderDef[] = [];
const slider = (group: string, id: string, label: string, min: number, max: number, def = 1): void => {
  sliders.push({ id, label, group, min, max, step: 0.01, default: def });
};

slider('Whole body', 'size', 'Overall size', 0.5, 1.8);
slider('Skin', 'skinSmoothness', 'Smoothness', 0, 4);
slider('Skin', 'skinThickness', 'Thickness', 0, 4);
slider('Head', 'headSize', 'Head size', 0.6, 1.8);
slider('Head', 'headWidth', 'Head width', 0.6, 1.6);
slider('Head', 'snoutLength', 'Snout length', 0.4, 2.2);
slider('Head', 'eyeSize', 'Eye size', 0.5, 2.2);
slider('Ears', 'earSize', 'Ear width', 0.5, 2.2);
slider('Ears', 'earLength', 'Ear length', 0.4, 2.6);
slider('Neck', 'neckLength', 'Neck length', 0.4, 3);
slider('Neck', 'neckThickness', 'Neck thickness', 0.5, 2);
slider('Body', 'torsoLength', 'Torso length', 0.6, 1.8);
slider('Body', 'torsoWidth', 'Torso width', 0.6, 1.8);
slider('Body', 'torsoHeight', 'Torso height', 0.6, 1.6);
slider('Body', 'chestSize', 'Chest size', 0.6, 1.6);
slider('Body', 'hipSize', 'Hip size', 0.6, 1.6);
slider('Front legs', 'frontLegLength', 'Front leg length', 0.5, 1.8);
slider('Front legs', 'frontLegWidth', 'Front leg width', 0.5, 2.4);
slider('Front legs', 'frontPawSize', 'Front paw size', 0.6, 2.2);
slider('Hind legs', 'hindLegLength', 'Hind leg length', 0.5, 1.8);
slider('Hind legs', 'hindLegWidth', 'Hind leg width', 0.5, 2.4);
slider('Hind legs', 'hindPawSize', 'Hind paw size', 0.6, 2.2);
slider('Tail', 'tailLength', 'Tail length', 0.3, 2.6);
slider('Tail', 'tailThickness', 'Tail thickness', 0.4, 2.6);

type P = ShapeParams;
const joints: JointDef[] = [];
const parts: PartDef[] = [];
const joint = (id: string, label: string, parent: string | null, pos: Vec3, scale?: (p: P) => number | Vec3): void => {
  joints.push({ id, label, parent, pos, scale });
};

// --- Spine, neck, head -----------------------------------------------------
joint('pelvis', 'Pelvis', null, [0, 0.3, -0.18]);
joint('chest', 'Chest', 'pelvis', [0, 0.33, 0.18], (p) => [1, 1, p.torsoLength]);
joint('neck', 'Neck base', 'chest', [0, 0.4, 0.26]);
joint('head', 'Head', 'neck', [0, 0.46, 0.34], (p) => p.neckLength);
joint('nose', 'Nose', 'head', [0, 0.44, 0.44], (p) => p.headSize * p.snoutLength);

// --- Left/right pairs ------------------------------------------------------
const sides = [
  { s: 'L', name: 'Left', x: 1 },
  { s: 'R', name: 'Right', x: -1 },
] as const;

for (const { s, name, x } of sides) {
  // Ears
  joint(`earBase${s}`, `${name} ear base`, 'head', [0.052 * x, 0.52, 0.335], (p) => [p.headWidth * p.headSize, p.headSize, p.headSize]);
  joint(`earTip${s}`, `${name} ear tip`, `earBase${s}`, [0.066 * x, 0.58, 0.32], (p) => p.earLength * p.earSize ** 0.3);
  // Front leg
  joint(`shoulder${s}`, `${name} shoulder`, 'chest', [0.07 * x, 0.3, 0.18], (p) => [p.torsoWidth, 1, 1]);
  joint(`elbow${s}`, `${name} elbow`, `shoulder${s}`, [0.07 * x, 0.17, 0.2], (p) => p.frontLegLength);
  joint(`frontPaw${s}`, `${name} front paw`, `elbow${s}`, [0.07 * x, 0.025, 0.22], (p) => p.frontLegLength);
  // Hind leg
  joint(`hip${s}`, `${name} hip`, 'pelvis', [0.07 * x, 0.28, -0.2], (p) => [p.torsoWidth, 1, 1]);
  joint(`knee${s}`, `${name} knee`, `hip${s}`, [0.07 * x, 0.17, -0.1], (p) => p.hindLegLength);
  joint(`hock${s}`, `${name} hock`, `knee${s}`, [0.07 * x, 0.09, -0.2], (p) => p.hindLegLength);
  joint(`hindPaw${s}`, `${name} hind paw`, `hock${s}`, [0.07 * x, 0.025, -0.17], (p) => p.hindLegLength);
}

// --- Tail ------------------------------------------------------------------
const tailScale = (p: P): number => p.tailLength;
joint('tail1', 'Tail 1', 'pelvis', [0, 0.32, -0.3], tailScale);
joint('tail2', 'Tail 2', 'tail1', [0, 0.38, -0.42], tailScale);
joint('tail3', 'Tail 3', 'tail2', [0, 0.46, -0.5], tailScale);
joint('tail4', 'Tail tip', 'tail3', [0, 0.55, -0.52], tailScale);

// --- Parts: body -----------------------------------------------------------
const HEAD = { from: 'head', to: 'nose' };

parts.push(
  {
    kind: 'blob', id: 'pelvisBlob', at: 'pelvis', color: FUR,
    radii: (p) => [0.09 * p.torsoWidth * p.hipSize, 0.1 * p.torsoHeight * p.hipSize, 0.13 * p.hipSize],
  },
  {
    kind: 'blob', id: 'chestBlob', at: 'chest', color: FUR,
    radii: (p) => [0.095 * p.torsoWidth * p.chestSize, 0.105 * p.torsoHeight * p.chestSize, 0.13 * p.chestSize],
  },
  {
    kind: 'segment', id: 'torso', from: 'pelvis', to: 'chest', shape: 'ellipsoid', color: FUR,
    radii: (p) => [0.09 * p.torsoWidth, 0.1 * p.torsoHeight], extend: () => 0,
  },
  {
    kind: 'segment', id: 'neck', from: 'neck', to: 'head', shape: 'ellipsoid', color: FUR,
    radii: (p) => [0.045 * p.neckThickness, 0.045 * p.neckThickness], extend: () => 0.03,
  },
);

// --- Parts: head -----------------------------------------------------------
parts.push(
  {
    kind: 'blob', id: 'head', at: 'head', facing: HEAD, color: FUR,
    radii: (p) => [0.08 * p.headSize * p.headWidth, 0.07 * p.headSize, 0.075 * p.headSize],
  },
  {
    kind: 'blob', id: 'snout', at: 'head', lerpTo: { joint: 'nose', t: 0.78 }, facing: HEAD, color: FUR_LIGHT,
    radii: (p) => [0.032 * p.headSize, 0.026 * p.headSize, 0.035 * p.headSize * p.snoutLength],
  },
  {
    kind: 'blob', id: 'noseTip', at: 'nose', facing: HEAD, color: PINK, skin: false,
    radii: (p) => [0.012 * p.headSize, 0.009 * p.headSize, 0.009 * p.headSize],
    // Sits a little proud of the snout so the skin does not bury it.
    offset: (p) => [0, 0, 0.016 * p.headSize * p.snoutLength],
  },
);

for (const { s, x } of sides) {
  parts.push(
    {
      kind: 'blob', id: `eye${s}`, at: 'head', facing: HEAD, color: EYE, skin: false,
      radii: (p) => [0.014 * p.eyeSize * p.headSize, 0.016 * p.eyeSize * p.headSize, 0.01 * p.eyeSize * p.headSize],
      // Sit on the head surface (not inside it) so the skin does not bury them.
      offset: (p) => [0.044 * x * p.headSize * p.headWidth, 0.023 * p.headSize, 0.058 * p.headSize],
    },
    {
      kind: 'segment', id: `ear${s}`, from: `earBase${s}`, to: `earTip${s}`, shape: 'cone', color: FUR,
      radii: (p) => [0.04 * p.earSize * p.headSize, 0.012 * p.earSize * p.headSize],
    },
  );
}

// --- Parts: legs -----------------------------------------------------------
for (const { s } of sides) {
  parts.push(
    // Front
    {
      kind: 'segment', id: `frontUpper${s}`, from: `shoulder${s}`, to: `elbow${s}`, shape: 'ellipsoid', color: FUR,
      radii: (p) => [0.04 * p.frontLegWidth, 0.04 * p.frontLegWidth], extend: (p) => 0.03 * p.frontLegWidth,
    },
    {
      kind: 'segment', id: `frontLower${s}`, from: `elbow${s}`, to: `frontPaw${s}`, shape: 'ellipsoid', color: FUR,
      radii: (p) => [0.028 * p.frontLegWidth, 0.028 * p.frontLegWidth], extend: (p) => 0.012 * p.frontLegWidth,
    },
    {
      kind: 'blob', id: `frontPawBlob${s}`, at: `frontPaw${s}`, color: FUR_LIGHT,
      radii: (p) => [0.03 * p.frontPawSize, 0.024 * p.frontPawSize, 0.048 * p.frontPawSize],
      offset: (p) => [0, 0, 0.018 * p.frontPawSize],
    },
    // Hind
    {
      kind: 'segment', id: `thigh${s}`, from: `hip${s}`, to: `knee${s}`, shape: 'ellipsoid', color: FUR,
      radii: (p) => [0.05 * p.hindLegWidth, 0.05 * p.hindLegWidth], extend: (p) => 0.03 * p.hindLegWidth,
    },
    {
      kind: 'segment', id: `shin${s}`, from: `knee${s}`, to: `hock${s}`, shape: 'ellipsoid', color: FUR,
      radii: (p) => [0.03 * p.hindLegWidth, 0.03 * p.hindLegWidth], extend: (p) => 0.015 * p.hindLegWidth,
    },
    {
      kind: 'segment', id: `metatarsus${s}`, from: `hock${s}`, to: `hindPaw${s}`, shape: 'ellipsoid', color: FUR,
      radii: (p) => [0.024 * p.hindLegWidth, 0.024 * p.hindLegWidth], extend: (p) => 0.012 * p.hindLegWidth,
    },
    {
      kind: 'blob', id: `hindPawBlob${s}`, at: `hindPaw${s}`, color: FUR_LIGHT,
      radii: (p) => [0.03 * p.hindPawSize, 0.024 * p.hindPawSize, 0.047 * p.hindPawSize],
      offset: (p) => [0, 0, 0.018 * p.hindPawSize],
    },
  );
}

// --- Parts: tail -----------------------------------------------------------
const tail = (id: string, from: string, to: string, r: number): PartDef => ({
  kind: 'segment', id, from, to, shape: 'ellipsoid', color: FUR,
  radii: (p) => [r * p.tailThickness, r * p.tailThickness], extend: (p) => 0.6 * r * p.tailThickness,
});
parts.push(
  tail('tail1', 'tail1', 'tail2', 0.032),
  tail('tail2', 'tail2', 'tail3', 0.028),
  tail('tail3', 'tail3', 'tail4', 0.025),
  {
    kind: 'blob', id: 'tailTip', at: 'tail4', color: FUR_LIGHT,
    radii: (p) => [0.026 * p.tailThickness, 0.026 * p.tailThickness, 0.026 * p.tailThickness],
  },
);

export const catModel: ModelDef = {
  id: 'cat',
  name: 'Cat',
  joints,
  parts,
  sliders,
  groundJoints: ['frontPawL', 'frontPawR', 'hindPawL', 'hindPawR'],
  groundClearance: 0.024,
  sizeParam: 'size',
  skin: {
    smoothness: (p) => 0.012 * p.skinSmoothness,
    thickness: (p) => 0.003 * p.skinThickness,
  },
};

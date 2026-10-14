import type { ColorDef, JointDef, ModelDef, PartDef, PosePreset, ShapeParams, SliderDef } from '../core/types';
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
slider('Fur', 'furDensity', 'Density', 0, 3);
slider('Fur', 'furLength', 'Length', 0, 3);
slider('Fur', 'furThickness', 'Strand thickness', 0.3, 3);
slider('Fur', 'furMessiness', 'Messiness', 0, 3);
slider('Fur', 'furSoftness', 'Softness', 0, 2);
slider('Head', 'headSize', 'Head size', 0.6, 1.8);
slider('Head', 'headWidth', 'Head width', 0.6, 1.6);
slider('Head', 'snoutLength', 'Snout length', 0.4, 2.2);
slider('Head', 'eyeSize', 'Eye size', 0.5, 2.2);
slider('Head', 'eyeSpacing', 'Eye spacing (close ↔ wide)', 0.7, 1.4);
slider('Head', 'eyeHeight', 'Eye height', 0.5, 1.6);

const colors: ColorDef[] = [];
const color = (group: string, id: string, label: string, def: number): void => {
  colors.push({ id, label, group, default: def });
};
color('Head', 'eyeColor', 'Eye colour', EYE);
color('Fur', 'furColor', 'Main colour', FUR);
color('Fur', 'pawColor', 'Foot colour', FUR_LIGHT);
slider('Ears', 'earSize', 'Ear width', 0.5, 2.2);
slider('Ears', 'earLength', 'Ear length', 0.4, 2.6);
slider('Ears', 'earFold', 'Ear fold (× 90°)', 0, 1.5, 0); // 0 = upright, 1 = flat out sideways, 1.5 = hanging down
// Where along the ear the fold happens: 0 = at the root, 0.5 = middle (default), 1 = at the tip. Not a multiplier.
sliders.push({ id: 'earFoldPos', label: 'Ear fold position (root → tip)', group: 'Ears', min: 0, max: 1, step: 0.01, default: 0.5, unit: '' });
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
const joint = (id: string, label: string, parent: string | null, pos: Vec3, scale?: JointDef['scale'], rotate?: JointDef['rotate']): void => {
  joints.push({ id, label, parent, pos, scale, rotate });
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
  // The base sits inside the head so the ear grows out of it (its rim stays within the head surface).
  joint(`earBase${s}`, `${name} ear base`, 'head', [0.034 * x, 0.49, 0.335], (p) => [p.headWidth * p.headSize, p.headSize, p.headSize]);
  // The ear bends at a hinge, placed by the fold position slider (rest: halfway up). The rest hinge is at
  // half the ear, so scaling each half by 2t / 2(1 - t) puts the hinge at fraction t and keeps the total length.
  const earLen = (p: P): number => p.earLength * p.earSize ** 0.3;
  joint(`earHinge${s}`, `${name} ear fold`, `earBase${s}`, [0.042 * x, 0.55, 0.33], (p) => earLen(p) * 2 * p.earFoldPos);
  joint(`earTip${s}`, `${name} ear tip`, `earHinge${s}`, [0.05 * x, 0.61, 0.325], (p) => earLen(p) * 2 * (1 - p.earFoldPos),
    // Fold down and out: swing the tip about a horizontal axis through the hinge (forward + across), so the ear keeps its length.
    (p) => ({ axis: [0.5, 0, -x], angle: p.earFold * (Math.PI / 2) }));
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
    kind: 'blob', id: 'pelvisBlob', at: 'pelvis', color: (p) => p.furColor,
    radii: (p) => [0.09 * p.torsoWidth * p.hipSize, 0.1 * p.torsoHeight * p.hipSize, 0.13 * p.hipSize],
  },
  {
    kind: 'blob', id: 'chestBlob', at: 'chest', color: (p) => p.furColor,
    radii: (p) => [0.095 * p.torsoWidth * p.chestSize, 0.105 * p.torsoHeight * p.chestSize, 0.13 * p.chestSize],
  },
  {
    kind: 'segment', id: 'torso', from: 'pelvis', to: 'chest', shape: 'ellipsoid', color: (p) => p.furColor,
    radii: (p) => [0.09 * p.torsoWidth, 0.1 * p.torsoHeight], extend: () => 0,
  },
  {
    kind: 'segment', id: 'neck', from: 'neck', to: 'head', shape: 'ellipsoid', color: (p) => p.furColor,
    radii: (p) => [0.045 * p.neckThickness, 0.045 * p.neckThickness], extend: () => 0.03,
  },
);

// --- Parts: head -----------------------------------------------------------
parts.push(
  {
    kind: 'blob', id: 'head', at: 'head', facing: HEAD, color: (p) => p.furColor,
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

/**
 * Eye centre in the head's local frame. Spacing and height move it across the head ellipsoid; the
 * forward offset is solved from the ellipsoid so the eye always sits on the surface (not inside it,
 * so the skin does not bury it). Fractions are of the head radii (lateral 0.08, vertical 0.07, forward 0.075).
 */
const eyeOffset = (p: P, x: number): [number, number, number] => {
  const u = 0.55 * p.eyeSpacing * x;
  const v = 0.33 * p.eyeHeight;
  const w = Math.sqrt(Math.max(0, 1 - u * u - v * v));
  return [0.08 * u * p.headSize * p.headWidth, 0.07 * v * p.headSize, 0.075 * w * p.headSize];
};

/** Eye layers stacked on the same centre: dark lid rim behind, iris, vertical slit pupil, small glint in front. */
const EYE_RIM = 0x1c1612;
const PUPIL = 0x0b0907;
const GLINT = 0xf5f5f0;
const eyeLayer = (p: P, x: number, dz: number): [number, number, number] => {
  const [l, v, f] = eyeOffset(p, x);
  return [l, v, f + dz * p.eyeSize * p.headSize];
};

for (const { s, x } of sides) {
  parts.push(
    {
      kind: 'blob', id: `eyeRim${s}`, at: 'head', facing: HEAD, color: EYE_RIM, skin: false,
      radii: (p) => [0.019 * p.eyeSize * p.headSize, 0.017 * p.eyeSize * p.headSize, 0.007 * p.eyeSize * p.headSize],
      offset: (p) => eyeLayer(p, x, -0.002),
    },
    {
      kind: 'blob', id: `eye${s}`, at: 'head', facing: HEAD, color: (p) => p.eyeColor, skin: false,
      radii: (p) => [0.016 * p.eyeSize * p.headSize, 0.013 * p.eyeSize * p.headSize, 0.01 * p.eyeSize * p.headSize],
      offset: (p) => eyeLayer(p, x, 0),
    },
    {
      kind: 'blob', id: `eyePupil${s}`, at: 'head', facing: HEAD, color: PUPIL, skin: false,
      radii: (p) => [0.0035 * p.eyeSize * p.headSize, 0.0115 * p.eyeSize * p.headSize, 0.0022 * p.eyeSize * p.headSize],
      offset: (p) => eyeLayer(p, x, 0.0095),
    },
    {
      kind: 'blob', id: `eyeGlint${s}`, at: 'head', facing: HEAD, color: GLINT, skin: false,
      radii: (p) => [0.0028 * p.eyeSize * p.headSize, 0.0028 * p.eyeSize * p.headSize, 0.0012 * p.eyeSize * p.headSize],
      offset: (p) => {
        const [l, v, f] = eyeLayer(p, x, 0.0105);
        // Glint on the outer, upper part of each eye, as in the reference photo.
        return [l + Math.sign(x) * 0.0055 * p.eyeSize * p.headSize, v + 0.0055 * p.eyeSize * p.headSize, f];
      },
    },
    // Two halves meeting at the fold hinge; the upper half is a little slimmer so the ear still tapers.
    {
      kind: 'segment', id: `ear${s}`, from: `earBase${s}`, to: `earHinge${s}`, shape: 'ellipsoid', color: (p) => p.furColor,
      radii: (p) => [0.034 * p.earSize * p.headSize * p.headWidth, 0.018 * p.earSize * p.headSize],
    },
    {
      kind: 'segment', id: `earTop${s}`, from: `earHinge${s}`, to: `earTip${s}`, shape: 'ellipsoid', color: (p) => p.furColor,
      radii: (p) => [0.7 * 0.034 * p.earSize * p.headSize * p.headWidth, 0.7 * 0.018 * p.earSize * p.headSize],
    },
  );
}

// --- Parts: legs -----------------------------------------------------------
for (const { s } of sides) {
  parts.push(
    // Front
    {
      kind: 'segment', id: `frontUpper${s}`, from: `shoulder${s}`, to: `elbow${s}`, shape: 'ellipsoid', color: (p) => p.furColor,
      radii: (p) => [0.04 * p.frontLegWidth, 0.04 * p.frontLegWidth], extend: (p) => 0.03 * p.frontLegWidth,
    },
    {
      kind: 'segment', id: `frontLower${s}`, from: `elbow${s}`, to: `frontPaw${s}`, shape: 'ellipsoid', color: (p) => p.furColor,
      radii: (p) => [0.028 * p.frontLegWidth, 0.028 * p.frontLegWidth], extend: (p) => 0.012 * p.frontLegWidth,
    },
    {
      kind: 'blob', id: `frontPawBlob${s}`, at: `frontPaw${s}`, color: (p) => p.pawColor,
      radii: (p) => [0.03 * p.frontPawSize, 0.024 * p.frontPawSize, 0.048 * p.frontPawSize],
      offset: (p) => [0, 0, 0.018 * p.frontPawSize],
    },
    // Hind
    {
      kind: 'segment', id: `thigh${s}`, from: `hip${s}`, to: `knee${s}`, shape: 'ellipsoid', color: (p) => p.furColor,
      radii: (p) => [0.05 * p.hindLegWidth, 0.05 * p.hindLegWidth], extend: (p) => 0.03 * p.hindLegWidth,
    },
    {
      kind: 'segment', id: `shin${s}`, from: `knee${s}`, to: `hock${s}`, shape: 'ellipsoid', color: (p) => p.furColor,
      radii: (p) => [0.03 * p.hindLegWidth, 0.03 * p.hindLegWidth], extend: (p) => 0.015 * p.hindLegWidth,
    },
    {
      kind: 'segment', id: `metatarsus${s}`, from: `hock${s}`, to: `hindPaw${s}`, shape: 'ellipsoid', color: (p) => p.furColor,
      radii: (p) => [0.024 * p.hindLegWidth, 0.024 * p.hindLegWidth], extend: (p) => 0.012 * p.hindLegWidth,
    },
    {
      kind: 'blob', id: `hindPawBlob${s}`, at: `hindPaw${s}`, color: (p) => p.pawColor,
      radii: (p) => [0.03 * p.hindPawSize, 0.024 * p.hindPawSize, 0.047 * p.hindPawSize],
      offset: (p) => [0, 0, 0.018 * p.hindPawSize],
    },
  );
}

// --- Parts: tail -----------------------------------------------------------
const tail = (id: string, from: string, to: string, r: number): PartDef => ({
  kind: 'segment', id, from, to, shape: 'ellipsoid', color: (p) => p.furColor,
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

// --- Pose presets ----------------------------------------------------------
// Each entry is where a joint ends up relative to its rest position (metres).
// Joints not listed follow their parent; a paw listed at [0, 0, 0] stays planted.
const ZERO: Vec3 = [0, 0, 0];
const pair = (name: string, d: Vec3): Record<string, Vec3> => ({ [`${name}L`]: d, [`${name}R`]: d });

// Left/right limb offsets mirror each other: the left x is kept, the right x is negated.
const mirrored = (name: string, d: Vec3): Record<string, Vec3> => ({
  [`${name}L`]: d,
  [`${name}R`]: [-d[0], d[1], d[2]],
});

// Sitting: haunches down and folded forward, torso upright, forelegs straight under the shoulders.
const SIT: Record<string, Vec3> = {
  pelvis: [0, -0.195, 0.24],
  chest: [0, 0.0325, 0.012],
  neck: [0, 0.0325, 0.012],
  head: [0, 0.04, 0.022],
  ...mirrored('hip', [0.036, -0.195, 0.24]),
  ...mirrored('knee', [0.046, -0.04, 0.274]),
  ...mirrored('hock', [0.046, -0.06, 0.414]),
  ...mirrored('hindPaw', [0.046, 0, 0.484]),
  ...mirrored('shoulder', [0.012, 0, -0.018]),
  ...pair('elbow', [0, 0, 0.03]),
  ...pair('frontPaw', [0, 0, 0.08]),
  nose: [0, 0.04, 0.03],
  ...pair('earBase', [0, 0.04, 0.03]),
  ...pair('earHinge', [0, 0.04, 0.03]),
  ...pair('earTip', [0, 0.04, 0.03]),
  tail1: [0, -0.26, 0.288],
  tail2: [0, -0.159, 0.251],
  tail3: [0, -0.13, 0.262],
  tail4: [0, -0.13, 0.281],
};

const poses: PosePreset[] = [
  { id: 'sit', label: 'Sitting', displace: SIT },
  {
    id: 'maneki', label: 'Maneki-neko', displace: {
      ...SIT,
      head: [0, 0.05, 0.05],
      elbowL: [0.01, 0.06, 0.1],
      frontPawL: [0.02, 0.22, 0.14],
    },
  },
  {
    id: 'wave', label: 'Waving', displace: {
      elbowR: [-0.08, 0.1, 0.1],
      frontPawR: [-0.16, 0.2, 0.12],
    },
  },
  {
    id: 'jump', label: 'Jumping', displace: {
      pelvis: [0, 0.25, -0.04],
      chest: [0, 0.27, 0.02],
      head: [0, 0.29, 0.12],
      ...pair('elbow', [0, 0.27, 0.1]),
      ...pair('frontPaw', [0, 0.27, 0.3]),
      ...pair('knee', [0, 0.25, 0.02]),
      ...pair('hock', [0, 0.25, -0.08]),
      ...pair('hindPaw', [0, 0.25, -0.05]),
    },
  },
  {
    id: 'lick', label: 'Licking hand', displace: {
      ...SIT,
      head: [0, 0, 0.08],
      elbowR: [0.02, 0.2, 0.14],
      frontPawR: [0.05, 0.37, 0.18],
    },
  },
  {
    id: 'eat', label: 'Eating', displace: {
      head: [0, -0.22, 0.2],
    },
  },
  {
    id: 'guard', label: 'Guarding', displace: {
      pelvis: [0, -0.06, -0.02],
      chest: [0, -0.1, 0.04],
      neck: [0, -0.1, 0.04],
      head: [0, -0.06, 0.2],
      tail1: [0, -0.12, -0.04],
      ...pair('knee', [0, -0.05, 0]),
      ...pair('elbow', [0, -0.07, 0.04]),
      ...pair('hock', ZERO),
      ...pair('hindPaw', ZERO),
      ...pair('frontPaw', ZERO),
    },
  },
  {
    id: 'hold', label: 'Holding a fish', displace: {
      ...SIT,
      ...pair('elbow', [0, 0.06, 0.1]),
      elbowL: [0.02, 0.06, 0.1],
      frontPawL: [0.03, 0.14, 0.2],
      elbowR: [-0.02, 0.06, 0.1],
      frontPawR: [-0.03, 0.14, 0.2],
      head: [0, 0.04, 0.03],
    },
  },
  {
    id: 'read', label: 'Reading', displace: {
      ...SIT,
      head: [0, -0.07, 0.11],
      ...pair('elbow', [0, -0.03, 0.09]),
      ...pair('frontPaw', [0, -0.02, 0.2]),
    },
  },
  {
    id: 'sitTall', label: 'Sitting tall', displace: {
      ...SIT,
      pelvis: [0, -0.12, 0.2],
      ...mirrored('hip', [0.036, -0.12, 0.2]),
      ...mirrored('knee', [0.046, -0.04, 0.26]),
      tail1: [0.05, -0.2, 0.26],
      tail2: [0.12, -0.12, 0.2],
      tail3: [0.12, -0.1, 0.22],
      tail4: [0.1, -0.08, 0.24],
    },
  },
  {
    id: 'bowl', label: 'Holding a bowl', displace: {
      ...SIT,
      elbowR: [-0.02, 0.12, 0.1],
      frontPawR: [-0.04, 0.22, 0.17],
      elbowL: [0.01, -0.02, 0.1],
      frontPawL: [0.03, 0.02, 0.2],
    },
  },
  {
    id: 'gem', label: 'Holding a gem', displace: {
      ...SIT,
      elbowL: [0.02, 0.1, 0.12],
      frontPawL: [0.03, 0.2, 0.2],
      elbowR: [-0.02, 0.1, 0.12],
      frontPawR: [-0.03, 0.2, 0.2],
      head: [0, 0.05, 0.03],
      tail1: [0.12, -0.22, 0.3],
      tail2: [0.18, -0.16, 0.24],
      tail3: [0.16, -0.12, 0.26],
      tail4: [0.12, -0.1, 0.28],
    },
  },
  {
    id: 'curl', label: 'Curled up', displace: {
      pelvis: [0, -0.22, 0.25],
      chest: [0, -0.12, 0.12],
      head: [0, -0.14, 0.08],
      ...mirrored('hip', [0.036, -0.22, 0.25]),
      ...mirrored('knee', [0.046, -0.12, 0.3]),
      ...mirrored('hock', [0.046, -0.08, 0.36]),
      ...mirrored('hindPaw', [0.046, 0, 0.42]),
      ...pair('elbow', [0, -0.06, 0.12]),
      ...pair('frontPaw', [0, -0.02, 0.22]),
      tail1: [0.1, -0.22, 0.24],
      tail2: [0.2, -0.2, 0.12],
      tail3: [0.18, -0.12, 0.04],
      tail4: [0.1, -0.06, 0.02],
    },
  },
  {
    id: 'loaf', label: 'Meditating', displace: {
      ...SIT,
      elbowL: [0.02, 0.03, 0.1],
      frontPawL: [0.04, 0.06, 0.18],
      elbowR: [-0.02, 0.03, 0.1],
      frontPawR: [-0.04, 0.06, 0.18],
      tail1: [0.1, -0.2, 0.2],
      tail2: [0.14, -0.12, 0.18],
      tail3: [0.12, -0.1, 0.2],
      tail4: [0.1, -0.08, 0.22],
    },
  },
];

export const catModel: ModelDef = {
  id: 'cat',
  name: 'Cat',
  joints,
  parts,
  sliders,
  poses,
  colors,
  groundJoints: ['frontPawL', 'frontPawR', 'hindPawL', 'hindPawR'],
  groundClearance: 0.024,
  sizeParam: 'size',
  skin: {
    smoothness: (p) => 0.012 * p.skinSmoothness,
    thickness: (p) => 0.003 * p.skinThickness,
  },
  fur: {
    density: (p) => 8 * p.furDensity,
    length: (p) => 0.018 * p.furLength,
    thickness: (p) => 0.0013 * p.furThickness,
    messiness: (p) => 0.35 * p.furMessiness,
    softness: (p) => p.furSoftness,
  },
};

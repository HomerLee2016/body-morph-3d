import type { JointDef, ModelDef, Pose, ShapeParams } from './types';
import { add, mulv, sub, type Vec3 } from './vec';

export type JointPositions = Record<string, Vec3>;

export function defaultParams(model: ModelDef): ShapeParams {
  return Object.fromEntries(model.sliders.map((s) => [s.id, s.default]));
}

/** Throws if the joint list is not a valid single-rooted tree (parents before children). */
export function validateModel(model: ModelDef): void {
  const seen = new Set<string>();
  let roots = 0;
  for (const j of model.joints) {
    if (seen.has(j.id)) throw new Error(`Duplicate joint "${j.id}"`);
    if (j.parent === null) roots++;
    else if (!seen.has(j.parent)) throw new Error(`Joint "${j.id}" parent "${j.parent}" is missing or listed after it`);
    seen.add(j.id);
  }
  if (roots !== 1) throw new Error(`Expected exactly 1 root joint, found ${roots}`);
  for (const id of model.groundJoints) if (!seen.has(id)) throw new Error(`Unknown ground joint "${id}"`);
  for (const part of model.parts) {
    const refs = part.kind === 'segment' ? [part.from, part.to] : [part.at, part.lerpTo?.joint, part.facing?.from, part.facing?.to];
    for (const ref of refs) if (ref && !seen.has(ref)) throw new Error(`Part "${part.id}" references unknown joint "${ref}"`);
  }
}

const jointScale = (j: JointDef, params: ShapeParams): Vec3 => {
  const s = j.scale?.(params) ?? 1;
  return typeof s === 'number' ? [s, s, s] : s;
};

function solve(model: ModelDef, params: ShapeParams, pose: Pose, rootShift: Vec3): JointPositions {
  const world: JointPositions = {};
  const rest: JointPositions = {};
  for (const j of model.joints) {
    if (j.parent === null) {
      rest[j.id] = j.pos;
      world[j.id] = add(add(j.pos, rootShift), pose[j.id] ?? [0, 0, 0]);
      continue;
    }
    const parent = model.joints.find((p) => p.id === j.parent)!;
    // Offset is measured in the *unscaled* rest pose, then scaled by the slider.
    const offset = mulv(sub(j.pos, parent.pos), jointScale(j, params));
    rest[j.id] = add(rest[j.parent], offset);
    world[j.id] = add(add(world[j.parent], offset), pose[j.id] ?? [0, 0, 0]);
  }
  return world;
}

/**
 * Joint positions in model space for the given shape and pose.
 *
 * The model is lifted/lowered so its ground joints rest on the floor for the
 * *shape* alone (pose offsets are applied on top), so lengthening the legs
 * never sinks the cat into the ground.
 */
export function solveJoints(model: ModelDef, params: ShapeParams, pose: Pose = {}): JointPositions {
  const restPose = solve(model, params, {}, [0, 0, 0]);
  const lowest = Math.min(...model.groundJoints.map((id) => restPose[id][1]));
  return solve(model, params, pose, [0, model.groundClearance - lowest, 0]);
}

export function modelScale(model: ModelDef, params: ShapeParams): number {
  return model.sizeParam ? (params[model.sizeParam] ?? 1) : 1;
}

import type { ModelDef, Pose, PosePreset } from './types';
import type { Vec3 } from './vec';

/**
 * Converts "where each joint ends up relative to rest" into the per-joint offsets
 * the viewer stores. Joints are independent, so each offset is the joint's own
 * displacement. A joint not listed takes its parent's displacement, so presets
 * can move a whole limb by listing only its top joint.
 */
export function poseFromDisplacements(model: ModelDef, displace: Record<string, Vec3>): Pose {
  const total: Record<string, Vec3> = {};
  const pose: Pose = {};
  for (const j of model.joints) {
    const parentTotal: Vec3 = j.parent ? total[j.parent] : [0, 0, 0];
    const t = displace[j.id] ?? parentTotal;
    total[j.id] = t;
    if (t[0] !== 0 || t[1] !== 0 || t[2] !== 0) pose[j.id] = [t[0], t[1], t[2]];
  }
  return pose;
}

export function findPose(model: ModelDef, id: string): PosePreset | undefined {
  return model.poses?.find((p) => p.id === id);
}

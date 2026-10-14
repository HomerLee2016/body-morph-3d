import type { ModelDef, Pose, PosePreset } from './types';
import { sub, type Vec3 } from './vec';

/**
 * Converts "where each joint ends up relative to rest" into the per-joint offsets
 * the viewer stores. A child's offset is measured from its parent's displacement,
 * because children follow their parent. Joints not listed follow their parent.
 */
export function poseFromDisplacements(model: ModelDef, displace: Record<string, Vec3>): Pose {
  const total: Record<string, Vec3> = {};
  const pose: Pose = {};
  for (const j of model.joints) {
    const parentTotal: Vec3 = j.parent ? total[j.parent] : [0, 0, 0];
    const t = displace[j.id] ?? parentTotal;
    total[j.id] = t;
    const offset = sub(t, parentTotal);
    if (offset[0] !== 0 || offset[1] !== 0 || offset[2] !== 0) pose[j.id] = offset;
  }
  return pose;
}

export function findPose(model: ModelDef, id: string): PosePreset | undefined {
  return model.poses?.find((p) => p.id === id);
}

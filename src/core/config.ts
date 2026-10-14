import type { ModelDef, Pose, ShapeParams } from './types';
import type { Vec3 } from './vec';
import { defaultParams } from './rig';

/** Marks a file as ours, so importing a random JSON file fails with a clear message. */
export const CONFIG_FORMAT = 'body-morph-3d/config';
export const CONFIG_VERSION = 1;

export interface ModelConfig {
  shape: ShapeParams;
  pose: Pose;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Serialises shape and pose as a JSON file. Every slider is written, so the file is a full snapshot. */
export function exportConfig(model: ModelDef, shape: ShapeParams, pose: Pose): string {
  const jointIds = new Set(model.joints.map((j) => j.id));
  const config = {
    format: CONFIG_FORMAT,
    version: CONFIG_VERSION,
    model: model.id,
    shape: Object.fromEntries(model.sliders.map((s) => [s.id, shape[s.id] ?? s.default])),
    pose: Object.fromEntries(Object.entries(pose).filter(([id]) => jointIds.has(id))),
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * Parses and validates a config file for `model`. Throws an Error with a readable message if
 * the file is not a config for this model. Missing sliders fall back to their defaults, shape
 * values are clamped to the slider range, and unknown slider or joint ids are ignored.
 */
export function importConfig(model: ModelDef, text: string): ModelConfig {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('the file is not valid JSON');
  }
  if (!isRecord(data) || data.format !== CONFIG_FORMAT) throw new Error('the file is not a Body Morph 3D config');
  if (data.version !== CONFIG_VERSION) throw new Error(`unsupported config version ${String(data.version)}`);
  if (data.model !== model.id) throw new Error(`the config is for "${String(data.model)}", not "${model.id}"`);

  const shape = defaultParams(model);
  if (data.shape !== undefined) {
    if (!isRecord(data.shape)) throw new Error('"shape" must be an object');
    for (const slider of model.sliders) {
      const value = data.shape[slider.id];
      if (value === undefined) continue;
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`shape "${slider.id}" must be a number`);
      shape[slider.id] = Math.min(slider.max, Math.max(slider.min, value));
    }
  }

  const pose: Pose = {};
  if (data.pose !== undefined) {
    if (!isRecord(data.pose)) throw new Error('"pose" must be an object');
    const jointIds = new Set(model.joints.map((j) => j.id));
    for (const [id, offset] of Object.entries(data.pose)) {
      if (!jointIds.has(id)) continue;
      if (!isVec3(offset)) throw new Error(`pose "${id}" must be an [x, y, z] array of numbers`);
      pose[id] = [offset[0], offset[1], offset[2]];
    }
  }

  return { shape, pose };
}

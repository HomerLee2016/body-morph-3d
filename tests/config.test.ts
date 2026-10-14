import { describe, expect, it } from 'vitest';
import { catModel } from '../src/models/cat';
import { CONFIG_FORMAT, CONFIG_VERSION, exportConfig, importConfig } from '../src/core/config';
import { poseFromDisplacements } from '../src/core/pose';
import { defaultParams, solveJoints } from '../src/core/rig';

const defaults = defaultParams(catModel);
const firstSlider = catModel.sliders[0];

const parse = (data: unknown): string => JSON.stringify(data);
const minimal = (overrides: Record<string, unknown> = {}): string =>
  parse({ format: CONFIG_FORMAT, version: CONFIG_VERSION, model: catModel.id, ...overrides });

describe('exportConfig / importConfig', () => {
  it('round-trips shape and pose', () => {
    const shape = { ...defaults, [firstSlider.id]: firstSlider.max };
    const pose = poseFromDisplacements(catModel, { head: [0, 0.05, 0.02] });
    const imported = importConfig(catModel, exportConfig(catModel, shape, pose));
    expect(imported.shape).toEqual(shape);
    expect(imported.pose).toEqual(pose);
  });

  it('reproduces the same skeleton after a round trip', () => {
    const shape = { ...defaults, [firstSlider.id]: firstSlider.min };
    const pose = poseFromDisplacements(catModel, { head: [0, 0.05, 0.02] });
    const imported = importConfig(catModel, exportConfig(catModel, shape, pose));
    expect(solveJoints(catModel, imported.shape, imported.pose)).toEqual(solveJoints(catModel, shape, pose));
  });

  it('writes a snapshot of every slider and only joints that exist', () => {
    const data = JSON.parse(exportConfig(catModel, defaults, { head: [0, 0, 0.1], ghost: [1, 1, 1] }));
    expect(data.format).toBe(CONFIG_FORMAT);
    expect(data.version).toBe(CONFIG_VERSION);
    expect(data.model).toBe(catModel.id);
    expect(Object.keys(data.shape).sort()).toEqual(catModel.sliders.map((s) => s.id).sort());
    expect(Object.keys(data.pose)).toEqual(['head']);
  });

  it('fills in defaults for missing sliders and joints', () => {
    const imported = importConfig(catModel, minimal());
    expect(imported.shape).toEqual(defaults);
    expect(imported.pose).toEqual({});
  });

  it('clamps out-of-range shape values to the slider range', () => {
    const imported = importConfig(catModel, minimal({ shape: { [firstSlider.id]: 999 } }));
    expect(imported.shape[firstSlider.id]).toBe(firstSlider.max);
  });

  it('ignores unknown slider and joint ids', () => {
    const imported = importConfig(catModel, minimal({ shape: { nope: 2 }, pose: { nope: [0, 0, 0] } }));
    expect(imported.shape).toEqual(defaults);
    expect(imported.pose).toEqual({});
  });

  it('rejects text that is not JSON', () => {
    expect(() => importConfig(catModel, '{not json')).toThrow(/not valid JSON/);
  });

  it('rejects a JSON file that is not a Body Morph config', () => {
    expect(() => importConfig(catModel, parse({ shape: {} }))).toThrow(/not a Body Morph 3D config/);
    expect(() => importConfig(catModel, parse([1, 2]))).toThrow(/not a Body Morph 3D config/);
  });

  it('rejects an unsupported version', () => {
    expect(() => importConfig(catModel, minimal({ version: CONFIG_VERSION + 1 }))).toThrow(/unsupported config version/);
  });

  it('rejects a config for another model', () => {
    expect(() => importConfig(catModel, minimal({ model: 'dog' }))).toThrow(/for "dog"/);
  });

  it('rejects non-numeric shape values', () => {
    expect(() => importConfig(catModel, minimal({ shape: { [firstSlider.id]: 'big' } }))).toThrow(/must be a number/);
    expect(() => importConfig(catModel, minimal({ shape: { [firstSlider.id]: null } }))).toThrow(/must be a number/);
  });

  it('rejects malformed pose offsets', () => {
    expect(() => importConfig(catModel, minimal({ pose: { head: [0, 1] } }))).toThrow(/\[x, y, z\]/);
    expect(() => importConfig(catModel, minimal({ pose: { head: [0, 1, 'z'] } }))).toThrow(/\[x, y, z\]/);
  });

  it('rejects a shape or pose that is not an object', () => {
    expect(() => importConfig(catModel, minimal({ shape: [1] }))).toThrow(/"shape" must be an object/);
    expect(() => importConfig(catModel, minimal({ pose: 'x' }))).toThrow(/"pose" must be an object/);
  });
});

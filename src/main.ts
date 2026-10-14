import './style.css';
import { catModel } from './models/cat';
import { validateModel } from './core/rig';
import { findPose, poseFromDisplacements } from './core/pose';
import { Viewer } from './viewer/Viewer';
import { buildPanel } from './ui/panel';

const model = catModel;
validateModel(model);

const viewport = document.getElementById('viewport')!;
const hud = document.getElementById('hud')!;
const panelRoot = document.getElementById('panel')!;

const jointLabels = Object.fromEntries(model.joints.map((j) => [j.id, j.label]));

const renderHud = (): void => {
  const id = viewer.selectedJoint;
  hud.replaceChildren();
  const title = document.createElement('div');
  title.className = 'hud-title';
  const hint = document.createElement('div');
  hint.className = 'hud-hint';
  if (id) {
    title.textContent = `Selected: ${jointLabels[id]}`;
    hint.textContent = 'W A S D move · ↑ ↓ up/down · Shift faster · Esc deselect';
  } else {
    title.textContent = 'Drag to rotate · scroll to zoom';
    hint.textContent = 'Click a blue joint to pose it';
  }
  hud.append(title, hint);
};

const viewer = new Viewer(viewport, model, { onSelect: renderHud });

const panel = buildPanel(panelRoot, model, viewer.params, {
  onParam: (id, value) => viewer.setParam(id, value),
  onResetShape: () => {
    viewer.resetParams();
    panel.sync(viewer.params);
  },
  onResetPose: () => viewer.resetPose(),
  onPose: (id) => {
    const preset = findPose(model, id);
    if (preset) viewer.setPose(poseFromDisplacements(model, preset.displace));
  },
  onToggleJoints: (visible) => viewer.setJointsVisible(visible),
  onToggleLayer: (layer, visible) => viewer.setLayerVisible(layer, visible),
});

renderHud();

// Debug hook for manual testing / automated browser checks (dev server only).
if (import.meta.env.DEV) (window as unknown as { __viewer: Viewer }).__viewer = viewer;

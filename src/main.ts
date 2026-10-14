import './style.css';
import { catModel } from './models/cat';
import { validateModel } from './core/rig';
import { findPose, poseFromDisplacements } from './core/pose';
import { exportConfig, importConfig } from './core/config';
import { Viewer } from './viewer/Viewer';
import { buildPanel, downloadText } from './ui/panel';

const model = catModel;
validateModel(model);

const viewport = document.getElementById('viewport')!;
const hud = document.getElementById('hud')!;
const panelRoot = document.getElementById('panel')!;

const jointLabels = Object.fromEntries(model.joints.map((j) => [j.id, j.label]));

const renderHud = (): void => {
  const ids = viewer.selectedJoints;
  hud.replaceChildren();
  const title = document.createElement('div');
  title.className = 'hud-title';
  const hint = document.createElement('div');
  hint.className = 'hud-hint';
  if (ids.length === 1) {
    title.textContent = `Selected: ${jointLabels[ids[0]]}`;
    hint.textContent = 'W A S D move · ↑ ↓ up/down · Shift faster · Shift+click add/remove · Esc deselect';
  } else if (ids.length > 1) {
    title.textContent = `Selected: ${ids.length} joints`;
    hint.textContent = 'W A S D move all · ↑ ↓ up/down · Shift faster · Shift+click add/remove · Esc deselect';
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
  onExportConfig: () => {
    downloadText(`body-morph-3d-${model.id}.json`, exportConfig(model, viewer.params, viewer.pose), 'application/json');
  },
  onImportConfig: (text) => {
    try {
      const config = importConfig(model, text);
      viewer.setShape(config.shape);
      viewer.setPose(config.pose);
      panel.sync(viewer.params);
    } catch (err) {
      window.alert(`Could not import config: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
});

renderHud();

// Debug hook for manual testing / automated browser checks (dev server only).
if (import.meta.env.DEV) (window as unknown as { __viewer: Viewer }).__viewer = viewer;

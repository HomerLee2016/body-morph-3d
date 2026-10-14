import type { ColorDef, LayerId, ModelDef, ShapeParams, SliderDef } from '../core/types';

export interface PanelHandlers {
  onParam: (id: string, value: number) => void;
  onResetShape: () => void;
  onResetPose: () => void;
  onPose: (id: string) => void;
  onToggleJoints: (visible: boolean) => void;
  onToggleLayer: (layer: LayerId, visible: boolean) => void;
  onExportConfig: () => void;
  /** Called with the text of the chosen file. Throw to report a bad file. */
  onImportConfig: (text: string) => void;
}

/** Saves `text` as a file through a temporary download link. */
export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface Panel {
  /** Re-sync every slider with the given params (after a reset). */
  sync(params: ShapeParams): void;
}

/** Slider value as shown next to it: two decimals and the unit ("×" for multipliers). */
const formatValue = (def: SliderDef, v: number): string => `${v.toFixed(2)}${def.unit ?? '×'}`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function buildPanel(root: HTMLElement, model: ModelDef, params: ShapeParams, handlers: PanelHandlers): Panel {
  root.replaceChildren();

  const header = el('header', 'panel-header');
  header.append(el('h1', undefined, `${model.name} shape`));
  const actions = el('div', 'panel-actions');
  const resetShape = el('button', undefined, 'Reset shape');
  const resetPose = el('button', undefined, 'Reset pose');
  resetShape.type = resetPose.type = 'button';
  resetShape.addEventListener('click', handlers.onResetShape);
  resetPose.addEventListener('click', handlers.onResetPose);
  actions.append(resetShape, resetPose);

  const configActions = el('div', 'panel-actions config-actions');
  const exportButton = el('button', undefined, 'Export config');
  const importButton = el('button', undefined, 'Import config');
  exportButton.type = importButton.type = 'button';
  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.hidden = true;
  exportButton.addEventListener('click', handlers.onExportConfig);
  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = ''; // so picking the same file again still fires `change`
    if (file) handlers.onImportConfig(await file.text());
  });
  configActions.append(exportButton, importButton, fileInput);

  if (model.poses?.length) {
    const poses = el('div', 'poses');
    for (const preset of model.poses) {
      const button = el('button', undefined, preset.label);
      button.type = 'button';
      button.addEventListener('click', () => handlers.onPose(preset.id));
      poses.append(button);
    }
    header.append(poses);
  }

  const toggles = el('div', 'toggles');
  const addToggle = (label: string, checked: boolean, onChange: (checked: boolean) => void): void => {
    const toggle = el('label', 'toggle');
    const checkbox = el('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkbox.addEventListener('change', () => onChange(checkbox.checked));
    toggle.append(checkbox, el('span', undefined, label));
    toggles.append(toggle);
  };
  addToggle('Joints', true, handlers.onToggleJoints);
  if (model.skin) {
    addToggle('Muscles', false, (on) => handlers.onToggleLayer('muscles', on));
    addToggle('Skin', true, (on) => handlers.onToggleLayer('skin', on));
  }
  if (model.fur) addToggle('Fur', true, (on) => handlers.onToggleLayer('fur', on));
  header.append(actions, configActions, toggles);
  root.append(header);

  const rows = new Map<string, { input: HTMLInputElement; value: HTMLOutputElement; def: SliderDef }>();
  const colorRows = new Map<string, { input: HTMLInputElement; value: HTMLOutputElement; def: ColorDef }>();
  const groups = new Map<string, HTMLDetailsElement>();
  const groupFor = (name: string): HTMLDetailsElement => {
    let group = groups.get(name);
    if (!group) {
      group = el('details', 'group');
      group.open = true;
      group.append(el('summary', undefined, name));
      groups.set(name, group);
      root.append(group);
    }
    return group;
  };

  for (const def of model.sliders) {
    const group = groupFor(def.group);
    const row = el('div', 'row');
    const id = `slider-${def.id}`;
    const label = el('label', undefined, def.label);
    label.htmlFor = id;
    label.title = 'Double-click to reset';
    const value = el('output');
    value.htmlFor = id;
    const input = el('input');
    input.type = 'range';
    input.id = id;
    input.min = String(def.min);
    input.max = String(def.max);
    input.step = String(def.step);

    const apply = (v: number): void => {
      input.value = String(v);
      value.textContent = formatValue(def, v);
    };
    apply(params[def.id] ?? def.default);

    input.addEventListener('input', () => {
      const v = Number(input.value);
      apply(v);
      handlers.onParam(def.id, v);
    });
    // Drop focus after a drag so the arrow keys keep moving the selected joint.
    input.addEventListener('pointerup', () => input.blur());
    label.addEventListener('dblclick', () => {
      apply(def.default);
      handlers.onParam(def.id, def.default);
    });

    row.append(label, value, input);
    group.append(row);
    rows.set(def.id, { input, value, def });
  }

  for (const def of model.colors ?? []) {
    const group = groupFor(def.group);
    const row = el('div', 'row');
    const id = `color-${def.id}`;
    const label = el('label', undefined, def.label);
    label.htmlFor = id;
    label.title = 'Double-click to reset';
    const value = el('output');
    value.htmlFor = id;
    const input = el('input');
    input.type = 'color';
    input.id = id;

    const apply = (hex: number): void => {
      input.value = toHex(hex);
      value.textContent = input.value;
    };
    apply(params[def.id] ?? def.default);

    input.addEventListener('input', () => {
      const hex = parseInt(input.value.slice(1), 16);
      apply(hex);
      handlers.onParam(def.id, hex);
    });
    label.addEventListener('dblclick', () => {
      apply(def.default);
      handlers.onParam(def.id, def.default);
    });

    row.append(label, value, input);
    group.append(row);
    colorRows.set(def.id, { input, value, def });
  }

  return {
    sync(next) {
      for (const [id, row] of rows) {
        const v = next[id] ?? row.def.default;
        row.input.value = String(v);
        row.value.textContent = formatValue(row.def, v);
      }
      for (const [id, row] of colorRows) {
        row.input.value = toHex(next[id] ?? row.def.default);
        row.value.textContent = row.input.value;
      }
    },
  };
}

/** 0xrrggbb -> '#rrggbb' for `<input type="color">`. */
const toHex = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

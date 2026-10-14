import type { ModelDef, ShapeParams, SliderDef } from '../core/types';

export interface PanelHandlers {
  onParam: (id: string, value: number) => void;
  onResetShape: () => void;
  onResetPose: () => void;
  onToggleJoints: (visible: boolean) => void;
}

export interface Panel {
  /** Re-sync every slider with the given params (after a reset). */
  sync(params: ShapeParams): void;
}

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

  const toggle = el('label', 'toggle');
  const checkbox = el('input');
  checkbox.type = 'checkbox';
  checkbox.checked = true;
  checkbox.addEventListener('change', () => handlers.onToggleJoints(checkbox.checked));
  toggle.append(checkbox, el('span', undefined, 'Show joints'));
  header.append(actions, toggle);
  root.append(header);

  const rows = new Map<string, { input: HTMLInputElement; value: HTMLOutputElement; def: SliderDef }>();
  const groups = new Map<string, HTMLDetailsElement>();

  for (const def of model.sliders) {
    let group = groups.get(def.group);
    if (!group) {
      group = el('details', 'group');
      group.open = true;
      group.append(el('summary', undefined, def.group));
      groups.set(def.group, group);
      root.append(group);
    }

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
      value.textContent = `${v.toFixed(2)}×`;
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

  return {
    sync(next) {
      for (const [id, row] of rows) {
        const v = next[id] ?? row.def.default;
        row.input.value = String(v);
        row.value.textContent = `${v.toFixed(2)}×`;
      }
    },
  };
}

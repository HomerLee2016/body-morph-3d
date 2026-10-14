import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { defaultParams, modelScale, solveJoints } from '../core/rig';
import { partTransform } from '../core/parts';
import { collectSkinParts, createSkinField, meshSkin } from '../core/skin';
import type { LayerId, ModelDef, Pose, ShapeParams } from '../core/types';
import type { Vec3 } from '../core/vec';
import { SkinMesh } from './SkinMesh';

const MARKER_RADIUS = 0.016;
const MOVE_SPEED = 0.25; // metres per second
const FAST_MULTIPLIER = 3;
const CLICK_MAX_PIXELS = 5;

// Skin grid spacing (metres): coarse while the shape or pose is changing, fine once it settles.
const SKIN_VOXEL_LIVE = 0.016;
const SKIN_VOXEL_FINE = 0.007;
const SETTLE_MS = 160;

const COLORS = { idle: 0x2d9cdb, hover: 0xffffff, selected: 0xffd400 };

export interface ViewerEvents {
  onSelect?: (jointId: string | null) => void;
  onPoseChange?: () => void;
}

/**
 * Renders a {@link ModelDef} and handles camera, joint picking and keyboard
 * posing. Shape and pose live here as plain data; call {@link setParams} /
 * {@link resetPose} to change them.
 */
export class Viewer {
  readonly params: ShapeParams;
  readonly pose: Pose = {};

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly timer = new THREE.Timer();

  private readonly bodyGroup = new THREE.Group();
  private readonly partMeshes = new Map<string, THREE.Mesh>();
  private readonly markerGroup = new THREE.Group();
  private readonly markers = new Map<string, THREE.Mesh>();
  private readonly bones: THREE.LineSegments;
  private readonly skinMesh = new SkinMesh();
  private readonly layers: Record<LayerId, boolean> = { muscles: false, skin: true, fur: true };

  private readonly keys = new Set<string>();
  private selected: string | null = null;
  private hovered: string | null = null;
  private pointerDown: { x: number; y: number } | null = null;
  private dirty = true;
  private settleAt: number | null = null;
  private frame = 0;

  constructor(private readonly container: HTMLElement, private readonly model: ModelDef, private readonly events: ViewerEvents = {}) {
    this.params = defaultParams(model);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.setupScene();
    this.controls = this.setupCamera();

    // Body parts (one shared unit geometry per shape; scaled per part).
    const sphere = new THREE.SphereGeometry(1, 32, 20);
    const cone = new THREE.ConeGeometry(1, 1, 24);
    for (const part of model.parts) {
      const geometry = part.kind === 'segment' && part.shape === 'cone' ? cone : sphere;
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.85 }));
      mesh.castShadow = true;
      mesh.matrixAutoUpdate = false;
      this.partMeshes.set(part.id, mesh);
      this.bodyGroup.add(mesh);
    }
    this.scene.add(this.bodyGroup);
    this.bodyGroup.add(this.skinMesh.object);
    this.applyLayers();

    // Joint markers + skeleton lines, drawn on top of the body.
    const markerGeometry = new THREE.SphereGeometry(MARKER_RADIUS, 16, 12);
    for (const joint of model.joints) {
      const material = new THREE.MeshBasicMaterial({ color: COLORS.idle, depthTest: false, transparent: true, opacity: 0.95 });
      const marker = new THREE.Mesh(markerGeometry, material);
      marker.renderOrder = 10;
      marker.userData.jointId = joint.id;
      this.markers.set(joint.id, marker);
      this.markerGroup.add(marker);
    }
    const boneMaterial = new THREE.LineBasicMaterial({ color: 0x2d9cdb, depthTest: false, transparent: true, opacity: 0.55 });
    this.bones = new THREE.LineSegments(new THREE.BufferGeometry(), boneMaterial);
    this.bones.renderOrder = 9;
    this.bones.frustumCulled = false;
    this.markerGroup.add(this.bones);
    this.scene.add(this.markerGroup);

    this.bind();
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }

  // --- Public API -----------------------------------------------------------

  setParam(id: string, value: number): void {
    this.params[id] = value;
    this.dirty = true;
  }

  resetParams(): void {
    Object.assign(this.params, defaultParams(this.model));
    this.dirty = true;
  }

  resetPose(): void {
    for (const key of Object.keys(this.pose)) delete this.pose[key];
    this.dirty = true;
    this.events.onPoseChange?.();
  }

  setLayerVisible(layer: LayerId, visible: boolean): void {
    this.layers[layer] = visible;
    this.applyLayers();
    this.dirty = true;
  }

  setJointsVisible(visible: boolean): void {
    this.markerGroup.visible = visible;
    if (!visible) this.select(null);
  }

  select(jointId: string | null): void {
    if (this.selected === jointId) return;
    this.selected = jointId;
    this.refreshMarkerColors();
    this.events.onSelect?.(jointId);
  }

  get selectedJoint(): string | null {
    return this.selected;
  }

  /** Current joint positions in world space (after model scaling). */
  jointWorldPositions(): Record<string, Vec3> {
    const scale = modelScale(this.model, this.params);
    const joints = solveJoints(this.model, this.params, this.pose);
    return Object.fromEntries(Object.entries(joints).map(([id, p]) => [id, [p[0] * scale, p[1] * scale, p[2] * scale] as Vec3]));
  }

  /** Screen position (CSS pixels, relative to the canvas) of a joint; for tests/debugging. */
  jointScreenPosition(jointId: string): { x: number; y: number } {
    const p = this.jointWorldPositions()[jointId];
    const v = new THREE.Vector3(...p).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height };
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.unbind();
    this.controls.dispose();
    this.skinMesh.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // --- Setup ----------------------------------------------------------------

  private setupScene(): void {
    this.scene.background = new THREE.Color(0xeef1f5);
    this.scene.fog = new THREE.Fog(0xeef1f5, 4, 12);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8892a0, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(1.5, 2.5, 1.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -1.5;
    sun.shadow.camera.right = 1.5;
    sun.shadow.camera.top = 1.5;
    sun.shadow.camera.bottom = -1.5;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 8;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(4, 40, 0xb8c0cc, 0xcad1da);
    grid.position.y = 0.001;
    this.scene.add(grid);
  }

  private setupCamera(): OrbitControls {
    this.camera.position.set(0.95, 0.65, 1.1);
    const controls = new OrbitControls(this.camera, this.renderer.domElement);
    controls.target.set(0, 0.25, 0);
    controls.enableDamping = true;
    controls.minDistance = 0.3;
    controls.maxDistance = 6;
    controls.maxPolarAngle = Math.PI * 0.495; // stay above the floor
    controls.update();
    return controls;
  }

  // --- Events ---------------------------------------------------------------

  private resizeObserver = new ResizeObserver(() => this.resize());

  private bind(): void {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.resizeObserver.observe(this.container);
  }

  private unbind(): void {
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.resizeObserver.disconnect();
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private pick(event: PointerEvent): string | null {
    if (!this.markerGroup.visible) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // Markers ignore depth, so pick the one nearest the pointer ray rather than the nearest to the camera.
    let best: { id: string; dist: number } | null = null;
    for (const [id, marker] of this.markers) {
      const centre = marker.getWorldPosition(new THREE.Vector3());
      const dist = this.raycaster.ray.distanceToPoint(centre);
      const pickRadius = Math.max(MARKER_RADIUS * 1.6, centre.distanceTo(this.camera.position) * 0.012);
      if (dist <= pickRadius && (!best || dist < best.dist)) best = { id, dist };
    }
    return best?.id ?? null;
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.pointerDown = { x: e.clientX, y: e.clientY };
  };

  private onPointerUp = (e: PointerEvent): void => {
    const start = this.pointerDown;
    this.pointerDown = null;
    if (!start || e.button !== 0) return;
    // A drag orbits the camera; only a (nearly) stationary press selects.
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_MAX_PIXELS) return;
    this.select(this.pick(e));
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.buttons !== 0) return;
    const hit = this.pick(e);
    if (hit === this.hovered) return;
    this.hovered = hit;
    this.renderer.domElement.style.cursor = hit ? 'pointer' : '';
    this.refreshMarkerColors();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') return;
    if (e.key === 'Escape') {
      this.select(null);
      return;
    }
    const key = normaliseKey(e.key);
    if (!MOVE_KEYS.has(key) || !this.selected) return;
    // Arrow keys would otherwise nudge a focused slider instead of the joint.
    if (target?.tagName === 'INPUT') (target as HTMLInputElement).blur();
    e.preventDefault();
    this.keys.add(key);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(normaliseKey(e.key));
  };

  private onBlur = (): void => {
    this.keys.clear();
  };

  // --- Frame loop -----------------------------------------------------------

  private tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    this.applyKeyboardMove(dt);
    this.controls.update();
    if (this.dirty) {
      this.rebuild();
      this.dirty = false;
      this.settleAt = performance.now() + SETTLE_MS;
    } else if (this.settleAt !== null && performance.now() >= this.settleAt) {
      this.rebuildSkin(true); // nothing changed for a moment: spend time on the detailed skin
      this.settleAt = null;
    }
    this.renderer.render(this.scene, this.camera);
  };

  /** W/A/S/D move on the ground plane relative to the camera; Up/Down arrows move vertically. */
  private applyKeyboardMove(dt: number): void {
    if (!this.selected || this.keys.size === 0) return;
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1); // looking straight down
    forward.normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);

    const move = new THREE.Vector3();
    if (this.keys.has('w')) move.add(forward);
    if (this.keys.has('s')) move.sub(forward);
    if (this.keys.has('d')) move.add(right);
    if (this.keys.has('a')) move.sub(right);
    if (this.keys.has('arrowup')) move.y += 1;
    if (this.keys.has('arrowdown')) move.y -= 1;
    if (move.lengthSq() === 0) return;

    const fast = this.keys.has('shift') ? FAST_MULTIPLIER : 1;
    // World-space movement -> model space (the body group is uniformly scaled).
    move.normalize().multiplyScalar((MOVE_SPEED * fast * dt) / modelScale(this.model, this.params));
    const current = this.pose[this.selected] ?? [0, 0, 0];
    this.pose[this.selected] = [current[0] + move.x, current[1] + move.y, current[2] + move.z];
    this.dirty = true;
    this.events.onPoseChange?.();
  }

  /** Muscles shown if asked for; parts kept out of the skin (eyes, nose) are always shown while there is a skin. */
  private applyLayers(): void {
    const { skin } = this.model;
    for (const part of this.model.parts) {
      this.partMeshes.get(part.id)!.visible = !skin || this.layers.muscles || part.skin === false;
    }
    this.skinMesh.object.visible = !!skin && this.layers.skin;
    this.skinMesh.setGhost(this.layers.muscles);
  }

  private rebuild(): void {
    const scale = modelScale(this.model, this.params);
    const joints = solveJoints(this.model, this.params, this.pose);
    this.bodyGroup.scale.setScalar(scale);
    this.rebuildSkin(false, joints);

    const m = new THREE.Matrix4();
    for (const part of this.model.parts) {
      const t = partTransform(part, joints, this.params);
      const [x, y, z] = t.axes;
      m.makeBasis(new THREE.Vector3(...x).multiplyScalar(t.scale[0]), new THREE.Vector3(...y).multiplyScalar(t.scale[1]), new THREE.Vector3(...z).multiplyScalar(t.scale[2]));
      m.setPosition(...t.position);
      this.partMeshes.get(part.id)!.matrix.copy(m);
    }

    const lines: number[] = [];
    for (const joint of this.model.joints) {
      const p = joints[joint.id];
      this.markers.get(joint.id)!.position.set(p[0] * scale, p[1] * scale, p[2] * scale);
      if (joint.parent) {
        const q = joints[joint.parent];
        lines.push(q[0] * scale, q[1] * scale, q[2] * scale, p[0] * scale, p[1] * scale, p[2] * scale);
      }
    }
    this.bones.geometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  }

  private rebuildSkin(fine: boolean, joints = solveJoints(this.model, this.params, this.pose)): void {
    const skin = this.model.skin;
    if (!skin || !this.layers.skin) return;
    const parts = collectSkinParts(this.model, joints, this.params);
    const field = createSkinField(parts, skin.smoothness(this.params), skin.thickness(this.params));
    this.skinMesh.update(meshSkin(field, fine ? SKIN_VOXEL_FINE : SKIN_VOXEL_LIVE));
  }

  private refreshMarkerColors(): void {
    for (const [id, marker] of this.markers) {
      const material = marker.material as THREE.MeshBasicMaterial;
      const state = id === this.selected ? 'selected' : id === this.hovered ? 'hover' : 'idle';
      material.color.setHex(COLORS[state]);
      marker.scale.setScalar(state === 'selected' ? 1.5 : state === 'hover' ? 1.25 : 1);
    }
  }
}

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'shift']);
const normaliseKey = (key: string): string => key.toLowerCase();

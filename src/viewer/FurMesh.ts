import * as THREE from 'three';
import { MAX_HAIRS, rootShade, type Fur } from '../core/fur';

/** Unit strand: a tapered three-sided spike, radius 1 and height 1, darker at the root. */
function strandGeometry(root: number): THREE.BufferGeometry {
  const rings: { y: number; radius: number; shade: number }[] = [
    { y: 0, radius: 1, shade: root },
    { y: 0.45, radius: 0.65, shade: 0.9 },
  ];
  const positions: number[] = [];
  const colors: number[] = [];
  for (const { y, radius, shade } of rings) {
    for (let s = 0; s < 3; s++) {
      const angle = (s / 3) * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      colors.push(shade, shade, shade);
    }
  }
  positions.push(0, 1, 0);
  colors.push(1, 1, 1);

  const tip = rings.length * 3;
  const triangles: [number, number, number][] = [];
  for (let s = 0; s < 3; s++) {
    const n = (s + 1) % 3;
    triangles.push([s, n, 3 + n], [s, 3 + n, 3 + s], [3 + s, 3 + n, tip]);
  }
  // Wind every triangle so it faces away from the strand's axis.
  const index: number[] = [];
  for (const [a, b, c] of triangles) {
    const p = (i: number): THREE.Vector3 => new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    const normal = p(b).sub(p(a)).cross(p(c).sub(p(a)));
    const centre = p(a).add(p(b)).add(p(c));
    const outward = normal.x * centre.x + normal.z * centre.z;
    index.push(...(outward >= 0 ? [a, b, c] : [a, c, b]));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** All hairs as one instanced mesh. */
export class FurMesh {
  readonly object: THREE.InstancedMesh;
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  private readonly side = new THREE.Vector3();
  private readonly other = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private root: number;

  constructor() {
    this.root = rootShade(1);
    this.object = new THREE.InstancedMesh(strandGeometry(this.root), this.material, MAX_HAIRS);
    this.object.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_HAIRS * 3), 3);
    this.object.count = 0;
    this.object.frustumCulled = false;
    this.object.receiveShadow = true;
  }

  /** `thickness` is the strand width at the root, in metres. `softness` sets how dark the roots are. */
  update(fur: Fur, thickness: number, softness: number): void {
    this.setRootShade(rootShade(softness));
    const matrices = this.object.instanceMatrix.array as Float32Array;
    const radius = thickness / 2;
    for (let i = 0; i < fur.count; i++) {
      this.dir.set(fur.directions[i * 3], fur.directions[i * 3 + 1], fur.directions[i * 3 + 2]);
      // Any two vectors perpendicular to the strand will do for its cross-section.
      this.side.set(this.dir.y, -this.dir.x, 0);
      if (this.side.lengthSq() < 1e-6) this.side.set(1, 0, 0);
      this.side.normalize();
      this.other.crossVectors(this.dir, this.side);
      const length = fur.lengths[i];
      const o = i * 16;
      matrices[o] = this.side.x * radius; matrices[o + 1] = this.side.y * radius; matrices[o + 2] = this.side.z * radius; matrices[o + 3] = 0;
      matrices[o + 4] = this.dir.x * length; matrices[o + 5] = this.dir.y * length; matrices[o + 6] = this.dir.z * length; matrices[o + 7] = 0;
      matrices[o + 8] = this.other.x * radius; matrices[o + 9] = this.other.y * radius; matrices[o + 10] = this.other.z * radius; matrices[o + 11] = 0;
      matrices[o + 12] = fur.roots[i * 3]; matrices[o + 13] = fur.roots[i * 3 + 1]; matrices[o + 14] = fur.roots[i * 3 + 2]; matrices[o + 15] = 1;
    }
    (this.object.instanceColor!.array as Float32Array).set(fur.colors);
    this.object.count = fur.count;
    this.object.instanceMatrix.needsUpdate = true;
    this.object.instanceColor!.needsUpdate = true;
  }

  /** Recolour the strand's root vertices (the first ring) when the shading changes. */
  private setRootShade(shade: number): void {
    if (shade === this.root) return;
    this.root = shade;
    const colors = this.object.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let v = 0; v < 3; v++) colors.setXYZ(v, shade, shade, shade);
    colors.needsUpdate = true;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.material.dispose();
    this.object.dispose();
  }
}

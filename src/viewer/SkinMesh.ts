import * as THREE from 'three';
import type { SkinMesh as SkinMeshData } from '../core/skin';

/** The skin surface as one three.js mesh with per-vertex colours. */
export class SkinMesh {
  readonly object: THREE.Mesh;
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });

  constructor() {
    this.object = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.object.castShadow = true;
    this.object.receiveShadow = true;
    this.object.frustumCulled = false; // geometry is replaced often; bounds would be stale
  }

  update(data: SkinMeshData): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    this.object.geometry.dispose();
    this.object.geometry = geometry;
  }

  /** See-through so the muscles underneath can be seen. */
  setGhost(ghost: boolean): void {
    this.material.transparent = ghost;
    this.material.opacity = ghost ? 0.35 : 1;
    this.material.depthWrite = !ghost;
    this.material.needsUpdate = true;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.material.dispose();
  }
}

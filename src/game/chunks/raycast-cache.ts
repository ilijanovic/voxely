import * as THREE from '@/three'
import type { ChunkData, BlockType } from '../../types'

export class RaycastMeshCache {
  private cache: Array<THREE.InstancedMesh | THREE.Mesh> = []
  private dirty = true

  markDirty(): void {
    this.dirty = true
  }

  get(chunks: Map<number, ChunkData>): Array<THREE.InstancedMesh | THREE.Mesh> {
    if (!this.dirty) return this.cache
    this.cache = []
    for (const data of chunks.values()) {
      for (const child of data.group.children) {
        if (
          (child instanceof THREE.InstancedMesh || child instanceof THREE.Mesh) &&
          (child.userData as { blockType?: BlockType }).blockType
        ) {
          this.cache.push(child)
        }
      }
    }
    this.dirty = false
    return this.cache
  }
}

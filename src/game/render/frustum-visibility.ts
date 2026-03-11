import * as THREE from 'three'
import type { ChunkData } from '../../types'
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../constants'

export function updateChunkFrustumVisibility(params: {
  camera: THREE.PerspectiveCamera
  chunks: Map<number, ChunkData>
  frustum: THREE.Frustum
  projScreenMatrix: THREE.Matrix4
  chunkBox: THREE.Box3
  chunkBoxMin: THREE.Vector3
  chunkBoxMax: THREE.Vector3
}): void {
  params.projScreenMatrix.multiplyMatrices(
    params.camera.projectionMatrix,
    params.camera.matrixWorldInverse,
  )
  params.frustum.setFromProjectionMatrix(params.projScreenMatrix)
  for (const data of params.chunks.values()) {
    const worldX = data.cx * CHUNK_SIZE
    const worldZ = data.cz * CHUNK_SIZE
    params.chunkBoxMin.set(worldX, 0, worldZ)
    params.chunkBoxMax.set(worldX + CHUNK_SIZE, WORLD_HEIGHT, worldZ + CHUNK_SIZE)
    params.chunkBox.set(params.chunkBoxMin, params.chunkBoxMax)
    data.group.visible = params.frustum.intersectsBox(params.chunkBox)
  }
}

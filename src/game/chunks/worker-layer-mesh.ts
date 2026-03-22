import * as THREE from 'three'
import type { BlockType } from '../../types'
import type { GeometryLayer } from '../../terrain/worker-geometry'

/**
 * Builds a render mesh from one worker geometry layer and adds it to the chunk group.
 */
export function addWorkerGeometryLayerMesh(
  group: THREE.Group,
  layer: GeometryLayer,
  material: THREE.Material | THREE.Material[],
  userData?: { chunkKeyNum: number; blockType: BlockType },
): THREE.Mesh | null {
  const vertexCount = layer.position.length / 3
  if (!Number.isFinite(vertexCount) || vertexCount <= 0) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(layer.position, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(layer.normal, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(layer.uv, 2))
  if (layer.index) {
    geometry.setIndex(new THREE.BufferAttribute(layer.index, 1))
  }

  // Group ranges are in vertices for non-indexed BufferGeometry and indices for indexed BufferGeometry.
  // Worker face order [right, left, top, bottom, front, back] matches BoxGeometry material indices 0..5.
  let start = 0
  for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
    const count = layer.faceVertexCounts[faceIndex] ?? 0
    if (count > 0) geometry.addGroup(start, count, faceIndex)
    start += count
  }

  const mesh = new THREE.Mesh(geometry, material as THREE.Material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  if (userData) mesh.userData = userData
  group.add(mesh)
  return mesh
}

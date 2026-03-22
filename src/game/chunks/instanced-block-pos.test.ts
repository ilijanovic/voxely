/**
 * Tests for instanced mesh → voxel position (matrix-based), including grass variant buckets.
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { getBlockPosFromInstancedMesh } from './instanced-block-pos'

describe('getBlockPosFromInstancedMesh', () => {
  /**
   * Builds an instanced mesh with one full block at integer corner (bx,by,bz).
   */
  function meshWithCornerTranslation(
    bx: number,
    by: number,
    bz: number,
    blockType: 'grass',
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 1)
    const m = new THREE.Matrix4().makeTranslation(bx, by, bz)
    mesh.setMatrixAt(0, m)
    mesh.userData = { blockType }
    return mesh
  }

  it('returns corner block coords for grass (variant bucket local instanceId)', () => {
    const mesh = meshWithCornerTranslation(12, 63, -4, 'grass')
    expect(getBlockPosFromInstancedMesh(mesh, 0)).toEqual({ x: 12, y: 63, z: -4 })
  })

  it('returns correct coords when instanceId is not a global index into a merged list', () => {
    // Second bucket mesh: only one instance with local id 0 at (20, 64, 20) — not positions[0] of full chunk list
    const mesh = meshWithCornerTranslation(20, 64, 20, 'grass')
    expect(getBlockPosFromInstancedMesh(mesh, 0)).toEqual({ x: 20, y: 64, z: 20 })
  })

  it('returns null for invalid instanceId', () => {
    const mesh = meshWithCornerTranslation(0, 64, 0, 'grass')
    expect(getBlockPosFromInstancedMesh(mesh, -1)).toBeNull()
    expect(getBlockPosFromInstancedMesh(mesh, 1)).toBeNull()
  })
})

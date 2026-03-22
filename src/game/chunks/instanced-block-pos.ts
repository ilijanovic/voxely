/**
 * Resolves voxel (integer) block coordinates from an InstancedMesh hit.
 * When one block type is split across multiple InstancedMeshes (e.g. grass top texture variants),
 * `instanceId` is only valid within that mesh — the old `positions[instanceId]` lookup was wrong.
 */
import * as THREE from 'three'
import type { BlockPos, BlockType } from '../../types'
import { getBlockHeight } from '../../block-registry'
import { CROSS_GEOMETRY_BLOCK_TYPES } from './cross-geometry-block-types'

/** Same as addTallGrassLayer: 0.5 block + TALL_GRASS_Y_OFFSET (-0.02). */
const TALL_GRASS_MATRIX_Y_CENTER_OFFSET = 0.48

const EPS = 1e-4

const _local = new THREE.Matrix4()
const _world = new THREE.Matrix4()

/**
 * Maps world-space instance translation to integer block coordinates for mining / voxel lookup.
 *
 * @param mesh - Instanced block mesh (must set `userData.blockType`)
 * @param instanceId - Index within this mesh
 * @returns Block position or null if invalid
 */
export function getBlockPosFromInstancedMesh(mesh: THREE.InstancedMesh, instanceId: number): BlockPos | null {
  if (instanceId < 0 || instanceId >= mesh.count) return null
  mesh.getMatrixAt(instanceId, _local)
  _world.multiplyMatrices(mesh.matrixWorld, _local)
  const x = _world.elements[12]
  const y = _world.elements[13]
  const z = _world.elements[14]

  const bt = (mesh.userData as { blockType?: BlockType }).blockType
  if (!bt) return null

  if (bt === 'tall_grass') {
    return {
      x: Math.floor(x - 0.5 + EPS),
      y: Math.floor(y - TALL_GRASS_MATRIX_Y_CENTER_OFFSET + EPS),
      z: Math.floor(z - 0.5 + EPS),
    }
  }

  if (CROSS_GEOMETRY_BLOCK_TYPES.includes(bt)) {
    return {
      x: Math.floor(x - 0.5 + EPS),
      y: Math.floor(y + EPS),
      z: Math.floor(z - 0.5 + EPS),
    }
  }

  if (bt === 'water_source' || String(bt).startsWith('water_flowing_')) {
    const wh = getBlockHeight(bt)
    return {
      x: Math.floor(x - 0.5 + EPS),
      y: Math.floor(y - wh + EPS),
      z: Math.floor(z - 0.5 + EPS),
    }
  }

  return {
    x: Math.floor(x + EPS),
    y: Math.floor(y + EPS),
    z: Math.floor(z + EPS),
  }
}

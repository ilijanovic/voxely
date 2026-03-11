/**
 * Tests for rebuildChunkLayer / refreshChunkVisibleMeshes: verify that
 * both worker-generated THREE.Mesh and sync-generated THREE.InstancedMesh
 * children are removed from the group when a layer is rebuilt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

vi.mock('../../game-terrain', () => ({
  WORLD_SEED: 1,
  getHeight: () => 64,
  getResolvedBiome: () => 'plains',
  getBlockTypeAt: () => 'stone',
  generateTree: () => ({ wood: [], leaves: [] }),
  shouldPlaceTree: () => false,
  getTreePlacement: () => 0,
  getForestDensity: () => 0,
}))

vi.mock('../../block-materials', () => {
  const geo = new THREE.BoxGeometry(1, 1, 1)
  const mat = new THREE.MeshBasicMaterial()
  return {
    sharedBlockGeometry: geo,
    sharedTallGrassGeometry: geo,
    FOLIAGE_BLOCK_TYPES: [],
    getMaterialForBlockType: () => mat,
    getSnowLayerGeometry: () => geo,
    isSharedBlockOrSnowLayerGeometry: (g: THREE.BufferGeometry) => g === geo,
    setGrassInstanceColors: vi.fn(),
    setFoliageInstanceColors: vi.fn(),
  }
})

vi.mock('../../block-registry', () => ({
  isSolidBlock: () => true,
  isOccludingBlock: () => true,
  isUnbreakableBlock: () => false,
  getBlockHeight: () => 1,
}))

vi.mock('../../entities/spawn', () => ({
  despawnEntitiesInChunk: vi.fn(),
}))

vi.mock('../world-interactions/drops', () => ({
  spawnDrop: vi.fn(),
}))

vi.mock('../world-interactions/torches', () => ({
  placeTorch: vi.fn(),
}))

vi.mock('../world-interactions/mining', () => ({
  breakBlock: vi.fn(),
}))

import { rebuildChunkLayer, refreshChunkVisibleMeshes } from './chunk-generate-sync'
import type { ChunkSyncContext } from './chunk-generate-sync'
import type { ChunkData, BlockType } from '../../types'
import { localKey } from '../../chunk-runtime'
import { RaycastMeshCache } from './raycast-cache'
import { sharedBlockGeometry } from '../../block-materials'

function makeCtx(): ChunkSyncContext {
  return {
    grassColormapData: null,
    foliageColormapData: null,
    tallGrassMaterial: null,
    raycastMeshCache: new RaycastMeshCache(),
    frustumDirty: false,
    scene: new THREE.Scene(),
    drops: [],
    torchContainer: new THREE.Group(),
    placedTorches: [],
  }
}

function makeChunkData(cx: number, cz: number): ChunkData {
  return {
    group: new THREE.Group(),
    cx,
    cz,
    voxelMap: new Map(),
    blockPositionsByType: new Map(),
  }
}

describe('rebuildChunkLayer', () => {
  let ctx: ChunkSyncContext

  beforeEach(() => {
    ctx = makeCtx()
  })

  it('removes InstancedMesh children matching blockType', () => {
    const data = makeChunkData(0, 0)
    const instanced = new THREE.InstancedMesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
      1,
    )
    instanced.userData = { blockType: 'stone' }
    data.group.add(instanced)
    data.blockPositionsByType.set('stone' as BlockType, [])

    rebuildChunkLayer(ctx, data, 'stone' as BlockType)

    const remaining = data.group.children.filter(
      (c) => (c.userData as { blockType?: string }).blockType === 'stone',
    )
    expect(remaining).toHaveLength(0)
  })

  it('removes worker-generated Mesh children matching blockType', () => {
    const data = makeChunkData(0, 0)
    const workerGeo = new THREE.BufferGeometry()
    const workerMesh = new THREE.Mesh(workerGeo, new THREE.MeshBasicMaterial())
    workerMesh.userData = { blockType: 'stone' }
    data.group.add(workerMesh)
    data.blockPositionsByType.set('stone' as BlockType, [])

    rebuildChunkLayer(ctx, data, 'stone' as BlockType)

    const remaining = data.group.children.filter(
      (c) => (c.userData as { blockType?: string }).blockType === 'stone',
    )
    expect(remaining).toHaveLength(0)
  })

  it('removes both Mesh and InstancedMesh for the same blockType', () => {
    const data = makeChunkData(0, 0)

    const workerMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
    workerMesh.userData = { blockType: 'stone' }
    data.group.add(workerMesh)

    const instanced = new THREE.InstancedMesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
      1,
    )
    instanced.userData = { blockType: 'stone' }
    data.group.add(instanced)

    data.blockPositionsByType.set('stone' as BlockType, [])

    rebuildChunkLayer(ctx, data, 'stone' as BlockType)

    const remaining = data.group.children.filter(
      (c) => (c.userData as { blockType?: string }).blockType === 'stone',
    )
    expect(remaining).toHaveLength(0)
  })

  it('does not remove children of a different blockType', () => {
    const data = makeChunkData(0, 0)

    const dirtMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
    dirtMesh.userData = { blockType: 'dirt' }
    data.group.add(dirtMesh)

    data.blockPositionsByType.set('stone' as BlockType, [])

    rebuildChunkLayer(ctx, data, 'stone' as BlockType)

    expect(data.group.children).toHaveLength(1)
    expect((data.group.children[0].userData as { blockType?: string }).blockType).toBe('dirt')
  })

  it('disposes worker Mesh geometry but not sharedBlockGeometry', () => {
    const data = makeChunkData(0, 0)

    const workerGeo = new THREE.BufferGeometry()
    const disposeSpy = vi.spyOn(workerGeo, 'dispose')
    const workerMesh = new THREE.Mesh(workerGeo, new THREE.MeshBasicMaterial())
    workerMesh.userData = { blockType: 'stone' }
    data.group.add(workerMesh)

    const sharedMesh = new THREE.Mesh(sharedBlockGeometry, new THREE.MeshBasicMaterial())
    sharedMesh.userData = { blockType: 'stone' }
    data.group.add(sharedMesh)

    data.blockPositionsByType.set('stone' as BlockType, [])

    rebuildChunkLayer(ctx, data, 'stone' as BlockType)

    expect(disposeSpy).toHaveBeenCalled()
  })
})

describe('refreshChunkVisibleMeshes', () => {
  it('removes worker Mesh when rebuilding after mining (full refresh, no affectedBlockTypes)', () => {
    const ctx = makeCtx()
    const data = makeChunkData(0, 0)

    const workerMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
    workerMesh.userData = { blockType: 'stone' }
    data.group.add(workerMesh)

    data.voxelMap.set(localKey(5, 10, 5), 'stone' as BlockType)
    data.blockPositionsByType.set('stone' as BlockType, [{ x: 5, y: 10, z: 5 }])

    data.voxelMap.delete(localKey(5, 10, 5))

    refreshChunkVisibleMeshes(ctx, data)

    const stoneChildren = data.group.children.filter(
      (c) => (c.userData as { blockType?: string }).blockType === 'stone',
    )
    expect(stoneChildren).toHaveLength(0)
    expect(data.blockPositionsByType.get('stone' as BlockType)).toEqual([])
  })

  it('rebuilds only affected block types when affectedBlockTypes is passed', () => {
    const ctx = makeCtx()
    const data = makeChunkData(0, 0)

    const dirtMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
    dirtMesh.userData = { blockType: 'dirt' }
    data.group.add(dirtMesh)

    data.voxelMap.set(localKey(5, 10, 5), 'stone' as BlockType)
    data.blockPositionsByType.set('stone' as BlockType, [{ x: 5, y: 10, z: 5 }])
    data.blockPositionsByType.set('dirt' as BlockType, [])

    data.voxelMap.delete(localKey(5, 10, 5))

    refreshChunkVisibleMeshes(ctx, data, new Set(['stone' as BlockType]))

    expect(data.blockPositionsByType.get('stone' as BlockType)).toEqual([])
    const dirtChildren = data.group.children.filter(
      (c) => (c.userData as { blockType?: string }).blockType === 'dirt',
    )
    expect(dirtChildren).toHaveLength(1)
  })
})

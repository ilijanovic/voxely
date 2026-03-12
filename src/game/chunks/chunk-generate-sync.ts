import * as THREE from 'three'
import type { BlockType, ChunkData, BlockPos, TreeNoiseCaches, Biome } from '../../types'
import {
  CHUNK_SIZE,
  WATER_LEVEL,
  WATER_BLOCK_HEIGHT,
  WATER_PLANE_Y_OFFSET,
  WORLD_HEIGHT,
  SNOW_GROWTH_INTERVAL_SEC,
  SNOW_GROWTH_CANDIDATES_PER_INTERVAL,
} from '../../constants'
import {
  WORLD_SEED,
  getHeight,
  getResolvedBiome,
  getBlockTypeAt,
  getSurfaceBlockAt,
  generateTree,
  shouldPlaceTree,
  getTreePlacement,
  getForestDensity,
} from '../../game-terrain'
import {
  chunks,
  blockModifications,
  chunkKeyNumeric,
  chunkKey,
  blockKeyString,
  localKey,
  decodeLocalKey,
  invalidateColumnHeight,
  getBlockAt,
} from '../../chunk-runtime'
import { filterVisibleBlocks as filterVisibleBlocksPure } from './visible-blocks'
import {
  isSolidBlock as isBlockTypeSolid,
  isOccludingBlock as isBlockTypeOccluding,
  isUnbreakableBlock,
  getBlockHeight,
} from '../../block-registry'
import {
  setGrassInstanceColors,
  setFoliageInstanceColors,
  FOLIAGE_BLOCK_TYPES,
  sharedBlockGeometry,
  sharedTallGrassGeometry,
  sharedWaterPlaneGeometry,
  getMaterialForBlockType,
  getSnowLayerGeometry,
  isSharedBlockOrSnowLayerGeometry,
} from '../../block-materials'
import { despawnEntitiesInChunk } from '../../entities/spawn'
import { spawnDrop as spawnDropItem, type Drop } from '../world-interactions/drops'
import {
  placeTorch as placeTorchSystem,
  removeTorchesInChunk,
  isWallTorchBlockType,
  type PlacedTorch,
} from '../world-interactions/torches'
import { breakBlock as breakBlockSystem } from '../world-interactions/mining'
import { RaycastMeshCache } from './raycast-cache'
import { setInstanceLightLevels } from '../../terrain-light'

// Scratch buffers (reused every frame to avoid allocations)
const _matrix = new THREE.Matrix4()
const _position = new THREE.Vector3()

let _snowGrowthAccumulator = 0

const COLD_BIOMES: Set<Biome> = new Set([
  'snow',
  'grove',
  'snowy_slopes',
  'frozen_peaks',
  'jagged_peaks',
])

/** Block types that can have snow layers on top (when it's snowing). */
const BLOCKS_SNOW_CAN_LAY_ON: Set<BlockType> = new Set([
  'grass',
  'grass_snow',
  'grass_savanna',
  'dirt',
  'sand',
  'stone',
  'gravel',
  'grass_path',
  'snow',
])

export interface ChunkSyncContext {
  grassColormapData: ImageData | null
  foliageColormapData: ImageData | null
  tallGrassMaterial: THREE.MeshStandardMaterial | null
  /** Returns combined block+sky light 0–15 at (bx, by, bz). Used for terrain light rendering. */
  getLightAt: (bx: number, by: number, bz: number) => number
  raycastMeshCache: RaycastMeshCache
  frustumDirty: boolean
  scene: THREE.Scene
  drops: Drop[]
  torchContainer: THREE.Group
  placedTorches: PlacedTorch[]
}

function hasVertexColorsEnabled(material: THREE.Material | THREE.Material[]): boolean {
  if (Array.isArray(material)) {
    return material.some((m) => m instanceof THREE.MeshStandardMaterial && m.vertexColors)
  }
  return material instanceof THREE.MeshStandardMaterial && material.vertexColors
}

function ensureWhiteInstanceColorsForVertexColorMaterial(
  mesh: THREE.InstancedMesh,
  material: THREE.Material | THREE.Material[],
  count: number,
): void {
  if (!hasVertexColorsEnabled(material) || mesh.instanceColor) return
  const array = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    array[i * 3] = 1
    array[i * 3 + 1] = 1
    array[i * 3 + 2] = 1
  }
  mesh.instanceColor = new THREE.InstancedBufferAttribute(array, 3)
  mesh.instanceColor.needsUpdate = true
}

/** Instance position (p.x, p.y, p.z) is the block's minimum corner (bottom at world y = p.y).
 * For snow_layer_*, geometry is corner-based (bottom at local Y=0) so the mesh sits flush on the block below. */
export function addInstancedLayer(
  group: THREE.Group,
  positions: BlockPos[],
  material: THREE.Material | THREE.Material[],
  userData?: { chunkKeyNum: number; blockType: BlockType },
  geometry?: THREE.BufferGeometry,
): THREE.InstancedMesh | null {
  const count = positions.length
  if (count === 0) return null

  const geom = geometry ?? sharedBlockGeometry
  const mesh = new THREE.InstancedMesh(geom, material as THREE.Material, count)
  mesh.count = count

  for (let i = 0; i < count; i++) {
    const p = positions[i]
    _position.set(p.x, p.y, p.z)
    _matrix.makeTranslation(_position.x, _position.y, _position.z)
    mesh.setMatrixAt(i, _matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  ensureWhiteInstanceColorsForVertexColorMaterial(mesh, material, count)
  mesh.castShadow = true
  mesh.receiveShadow = true
  if (userData) mesh.userData = userData

  group.add(mesh)
  return mesh
}

/**
 * Adds an instanced water plane layer (for water_source and water_flowing_*).
 * Each instance is a horizontal plane at block Y + waterHeight (source = 1, flowing = 0.55–0.85).
 */
export function addWaterBlockLayer(
  group: THREE.Group,
  positions: BlockPos[],
  material: THREE.Material | THREE.Material[],
  waterHeight: number,
  userData?: { chunkKeyNum: number; blockType: BlockType },
): THREE.InstancedMesh | null {
  const count = positions.length
  if (count === 0) return null

  const mesh = new THREE.InstancedMesh(
    sharedWaterPlaneGeometry,
    material as THREE.Material,
    count,
  )
  mesh.count = count
  for (let i = 0; i < count; i++) {
    const p = positions[i]
    _position.set(p.x + 0.5, p.y + waterHeight, p.z + 0.5)
    _matrix.makeTranslation(_position.x, _position.y, _position.z)
    mesh.setMatrixAt(i, _matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  ensureWhiteInstanceColorsForVertexColorMaterial(mesh, material, count)
  mesh.castShadow = false
  mesh.receiveShadow = true
  if (userData) mesh.userData = userData
  group.add(mesh)
  return mesh
}

export function buildChunkWaterGeometry(
  worldX: number,
  worldZ: number,
  heightmap?: number[][],
): THREE.BufferGeometry | null {
  const waterY = WATER_LEVEL + WATER_BLOCK_HEIGHT + WATER_PLANE_Y_OFFSET
  const gridSize = CHUNK_SIZE + 1
  const positions = new Float32Array(gridSize * gridSize * 3)
  const normals = new Float32Array(gridSize * gridSize * 3)
  for (let lz = 0; lz < gridSize; lz++) {
    for (let lx = 0; lx < gridSize; lx++) {
      const i = (lx + lz * gridSize) * 3
      positions[i] = worldX + lx
      positions[i + 1] = waterY
      positions[i + 2] = worldZ + lz
      normals[i] = 0
      normals[i + 1] = 1
      normals[i + 2] = 0
    }
  }
  const indices: number[] = []
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const topY = heightmap ? heightmap[lx][lz] : getHeight(worldX + lx, worldZ + lz)
      if (topY >= WATER_LEVEL) continue
      const i00 = lx + lz * gridSize
      const i10 = lx + 1 + lz * gridSize
      const i01 = lx + (lz + 1) * gridSize
      const i11 = lx + 1 + (lz + 1) * gridSize
      indices.push(i00, i10, i11, i00, i11, i01)
    }
  }
  if (indices.length === 0) return null

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geo.setIndex(indices)
  return geo
}

export function buildPositionsByType(
  worldX: number,
  worldZ: number,
  voxelMapEntries: Array<[number, BlockType]>,
): Map<BlockType, BlockPos[]> {
  const byType = new Map<BlockType, BlockPos[]>()
  for (const [key, blockType] of voxelMapEntries) {
    const { lx, ly, lz } = decodeLocalKey(key)
    const pos: BlockPos = { x: worldX + lx, y: ly, z: worldZ + lz }
    const arr = byType.get(blockType) ?? []
    arr.push(pos)
    byType.set(blockType, arr)
  }
  return byType
}

const GRASS_BLOCK_TYPES_FOR_TALL_GRASS: BlockType[] = ['grass', 'grass_savanna']
/** Block types that use cross geometry (flowers, fern) – same list as in chunk-apply. */
const CROSS_GEOMETRY_BLOCK_TYPES: BlockType[] = [
  'dandelion',
  'poppy',
  'tulip_red',
  'oxeye_daisy',
  'blue_orchid',
  'fern',
]
const TALL_GRASS_SPAWN_CHANCE = 0.05
const TALL_GRASS_SPAWN_CHANCE_WOODLAND = 0.12
const TALL_GRASS_Y_OFFSET = -0.02

function pseudoRandomFromBlockPos(x: number, y: number, z: number): number {
  let h = WORLD_SEED >>> 0
  h ^= Math.imul((x | 0) >>> 0, 374761393)
  h = (h << 13) | (h >>> 19)
  h ^= Math.imul((y | 0) >>> 0, 668265263)
  h = (h << 11) | (h >>> 21)
  h ^= Math.imul((z | 0) >>> 0, 2147483647)
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  return ((h >>> 0) & 0xffffffff) / 0x100000000
}

export function getTallGrassPositions(
  worldX: number,
  worldZ: number,
  voxelMap: Map<number, BlockType>,
  positionsByType: Map<BlockType, BlockPos[]>,
  getBiome?: (x: number, z: number) => Biome,
): BlockPos[] {
  const out: BlockPos[] = []
  for (const blockType of GRASS_BLOCK_TYPES_FOR_TALL_GRASS) {
    const positions = positionsByType.get(blockType)
    if (!positions) continue
    for (const p of positions) {
      const lx = p.x - worldX
      const lz = p.z - worldZ
      const keyAbove = localKey(lx, p.y + 1, lz)
      if (voxelMap.has(keyAbove)) continue
      const chance =
        getBiome && (getBiome(p.x, p.z) === 'forest' || getBiome(p.x, p.z) === 'jungle')
          ? TALL_GRASS_SPAWN_CHANCE_WOODLAND
          : TALL_GRASS_SPAWN_CHANCE
      if (pseudoRandomFromBlockPos(p.x, p.y, p.z) > chance) continue
      out.push(p)
    }
  }
  return out
}

/**
 * Adds an instanced mesh with cross geometry (e.g. flowers, fern). Position is block corner.
 */
function addCrossGeometryLayer(
  group: THREE.Group,
  positions: BlockPos[],
  material: THREE.Material | THREE.Material[],
  userData?: { chunkKeyNum: number; blockType: BlockType },
): THREE.InstancedMesh | null {
  if (positions.length === 0) return null
  const mesh = new THREE.InstancedMesh(
    sharedTallGrassGeometry,
    material as THREE.Material,
    positions.length,
  )
  mesh.count = positions.length
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]
    _position.set(p.x + 0.5, p.y, p.z + 0.5)
    _matrix.makeTranslation(_position.x, _position.y, _position.z)
    mesh.setMatrixAt(i, _matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  ensureWhiteInstanceColorsForVertexColorMaterial(mesh, material, positions.length)
  mesh.castShadow = false
  mesh.receiveShadow = true
  if (userData) mesh.userData = userData
  group.add(mesh)
  return mesh
}

export function addTallGrassLayer(
  group: THREE.Group,
  positions: BlockPos[],
  material: THREE.MeshStandardMaterial,
): THREE.InstancedMesh | null {
  if (positions.length === 0) return null
  const mesh = new THREE.InstancedMesh(sharedTallGrassGeometry, material, positions.length)
  mesh.count = positions.length
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]
    _position.set(p.x + 0.5, p.y + 0.5 + TALL_GRASS_Y_OFFSET, p.z + 0.5)
    _matrix.makeTranslation(_position.x, _position.y, _position.z)
    mesh.setMatrixAt(i, _matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  ensureWhiteInstanceColorsForVertexColorMaterial(mesh, material, positions.length)
  mesh.castShadow = false
  mesh.receiveShadow = true
  group.add(mesh)
  return mesh
}

export function filterVisibleBlocks(
  worldX: number,
  worldZ: number,
  voxelMap: Map<number, BlockType>,
  positions: BlockPos[],
): BlockPos[] {
  return filterVisibleBlocksPure({
    worldX,
    worldZ,
    chunkSize: CHUNK_SIZE,
    worldHeight: WORLD_HEIGHT,
    voxelMap,
    positions,
    localKey,
    isOccludingBlock: isBlockTypeOccluding,
  })
}

export function getLayerPositions(data: ChunkData, blockType: BlockType): BlockPos[] | null {
  return data.blockPositionsByType.get(blockType) ?? null
}

export function getBlockWorldPosition(
  chunkKeyNum: number,
  blockType: BlockType,
  instanceId: number,
): BlockPos | null {
  const data = chunks.get(chunkKeyNum)
  if (!data) return null
  const positions = getLayerPositions(data, blockType)
  if (!positions || instanceId < 0 || instanceId >= positions.length) return null
  return positions[instanceId]
}

export function spawnDrop(
  ctx: ChunkSyncContext,
  worldX: number,
  worldZ: number,
  startY: number,
  restY: number,
  blockType: BlockType,
  time: number,
): void {
  spawnDropItem({
    scene: ctx.scene,
    drops: ctx.drops,
    worldX,
    worldZ,
    startY,
    restY,
    blockType,
    time,
  })
}

export function placeTorch(
  ctx: ChunkSyncContext,
  bx: number,
  by: number,
  bz: number,
  preferredNormal?: { x: number; y: number; z: number },
): boolean {
  return placeTorchSystem({
    bx,
    by,
    bz,
    blockType: 'torch',
    preferredNormal,
    chunkKeyNum: chunkKeyNumeric(Math.floor(bx / CHUNK_SIZE), Math.floor(bz / CHUNK_SIZE)),
    torchContainer: ctx.torchContainer,
    placedTorches: ctx.placedTorches,
    getBlockAt,
  })
}

export function rebuildChunkLayer(
  ctx: ChunkSyncContext,
  data: ChunkData,
  blockType: BlockType,
): void {
  const keyNum = chunkKeyNumeric(data.cx, data.cz)
  const positions = getLayerPositions(data, blockType)
  if (!positions) return

  for (let i = data.group.children.length - 1; i >= 0; i--) {
    const child = data.group.children[i]
    const ud = child.userData as { blockType?: BlockType }
    if (
      ud.blockType === blockType &&
      (child instanceof THREE.InstancedMesh || child instanceof THREE.Mesh)
    ) {
      data.group.remove(child)
      if (child instanceof THREE.InstancedMesh) {
        child.dispose()
      } else if (child.geometry && !isSharedBlockOrSnowLayerGeometry(child.geometry)) {
        child.geometry.dispose()
      }
    }
  }

  if (positions.length === 0) return

  // tall_grass: only the cross layer (addTallGrassLayer), no box.
  if (blockType === 'tall_grass') {
    if (ctx.tallGrassMaterial) {
      const mesh = addTallGrassLayer(data.group, positions, ctx.tallGrassMaterial)
      if (mesh) {
        setInstanceLightLevels(mesh, positions, ctx.getLightAt)
        if (ctx.grassColormapData) {
          setGrassInstanceColors(mesh, positions, getResolvedBiome, ctx.grassColormapData)
        }
      }
    }
    return
  }

  // Flowers and fern: cross geometry.
  if (CROSS_GEOMETRY_BLOCK_TYPES.includes(blockType)) {
    const mesh = addCrossGeometryLayer(data.group, positions, getMaterialForBlockType(blockType), {
      chunkKeyNum: keyNum,
      blockType,
    })
    if (mesh) {
      setInstanceLightLevels(mesh, positions, ctx.getLightAt)
      if (ctx.grassColormapData) {
        setGrassInstanceColors(mesh, positions, getResolvedBiome, ctx.grassColormapData)
      }
    }
    return
  }

  const snowLayerMatch = /^snow_layer_([1-8])$/.exec(blockType)
  const geometry =
    snowLayerMatch != null ? getSnowLayerGeometry(parseInt(snowLayerMatch[1], 10)) : undefined

  // Water blocks (source + flowing 1..7): horizontal plane per block at block Y + water height
  if (blockType === 'water_source' || blockType.startsWith('water_flowing_')) {
    const waterHeight = getBlockHeight(blockType)
    const waterMesh = addWaterBlockLayer(
      data.group,
      positions,
      getMaterialForBlockType(blockType),
      waterHeight,
      { chunkKeyNum: keyNum, blockType },
    )
    if (waterMesh) setInstanceLightLevels(waterMesh, positions, ctx.getLightAt)
    return
  }

  const mesh = addInstancedLayer(
    data.group,
    positions,
    getMaterialForBlockType(blockType),
    {
      chunkKeyNum: keyNum,
      blockType,
    },
    geometry,
  )
  if (mesh) {
    setInstanceLightLevels(mesh, positions, ctx.getLightAt)
    if ((blockType === 'grass' || blockType === 'grass_savanna') && ctx.grassColormapData) {
      setGrassInstanceColors(mesh, positions, getResolvedBiome, ctx.grassColormapData)
    }
    if (FOLIAGE_BLOCK_TYPES.includes(blockType) && ctx.foliageColormapData) {
      setFoliageInstanceColors(mesh, positions, getResolvedBiome, ctx.foliageColormapData)
    }
  }
}

export function refreshChunkVisibleMeshes(
  ctx: ChunkSyncContext,
  data: ChunkData,
  affectedBlockTypes?: Set<BlockType>,
): void {
  const worldX = data.cx * CHUNK_SIZE
  const worldZ = data.cz * CHUNK_SIZE
  const positionsByType = buildPositionsByType(
    worldX,
    worldZ,
    Array.from(data.voxelMap.entries()) as Array<[number, BlockType]>,
  )

  if (affectedBlockTypes !== undefined) {
    for (const blockType of affectedBlockTypes) {
      const positions = positionsByType.get(blockType) ?? []
      const visible = filterVisibleBlocks(worldX, worldZ, data.voxelMap, positions)
      data.blockPositionsByType.set(blockType, visible)
      rebuildChunkLayer(ctx, data, blockType)
    }
  } else {
    const previousTypes = new Set<BlockType>(data.blockPositionsByType.keys())
    const nextVisibleByType = new Map<BlockType, BlockPos[]>()

    for (const [blockType, positions] of positionsByType) {
      nextVisibleByType.set(
        blockType,
        filterVisibleBlocks(worldX, worldZ, data.voxelMap, positions),
      )
    }
    for (const blockType of previousTypes) {
      if (!nextVisibleByType.has(blockType)) nextVisibleByType.set(blockType, [])
    }

    data.blockPositionsByType = nextVisibleByType
    for (const blockType of nextVisibleByType.keys()) {
      rebuildChunkLayer(ctx, data, blockType)
    }
  }

  ctx.raycastMeshCache.markDirty()
  ctx.frustumDirty = true
}

export function breakBlock(
  ctx: ChunkSyncContext,
  chunkKeyNum: number,
  blockType: BlockType,
  worldX: number,
  worldY: number,
  worldZ: number,
  options?: { skipRefresh?: boolean; time?: number; dropType?: BlockType; skipDrop?: boolean },
): void {
  const time = options?.time ?? 0
  breakBlockSystem({
    chunkKeyNum,
    blockType,
    worldX,
    worldY,
    worldZ,
    chunks,
    getLayerPositions,
    isUnbreakableBlock,
    blockModifications,
    blockKeyString,
    invalidateColumnHeight,
    localKey,
    chunkSize: CHUNK_SIZE,
    isSolidBlock: isBlockTypeSolid,
    getBlockHeight,
    getBlockAt,
    refreshChunkVisibleMeshes: (data, affectedBlockTypes) =>
      refreshChunkVisibleMeshes(ctx, data, affectedBlockTypes),
    time,
    spawnDrop: (wx, wz, startY, restY, bt, t) => spawnDrop(ctx, wx, wz, startY, restY, bt, t),
    skipRefresh: options?.skipRefresh,
    dropType: options?.dropType,
    skipDrop: options?.skipDrop,
  })
}

export function unloadChunk(
  scene: THREE.Scene,
  keyNum: number,
  raycastMeshCache: RaycastMeshCache,
): { frustumDirty: boolean } {
  const data = chunks.get(keyNum)
  if (!data) return { frustumDirty: false }
  despawnEntitiesInChunk(scene, chunkKey(data.cx, data.cz))

  data.group.traverse((obj) => {
    if (
      obj instanceof THREE.Mesh &&
      obj.geometry &&
      !isSharedBlockOrSnowLayerGeometry(obj.geometry)
    ) {
      obj.geometry.dispose()
    }
  })
  scene.remove(data.group)
  chunks.delete(keyNum)
  raycastMeshCache.markDirty()
  return { frustumDirty: true }
}

export function generateChunk(ctx: ChunkSyncContext, chunkX: number, chunkZ: number): ChunkData {
  const keyNum = chunkKeyNumeric(chunkX, chunkZ)
  const existing = chunks.get(keyNum)
  if (existing) return existing

  const worldX = chunkX * CHUNK_SIZE
  const worldZ = chunkZ * CHUNK_SIZE

  const heightmap: number[][] = []
  for (let x = 0; x < CHUNK_SIZE; x++) {
    heightmap[x] = []
    for (let z = 0; z < CHUNK_SIZE; z++) {
      heightmap[x][z] = getHeight(worldX + x, worldZ + z)
    }
  }

  const voxelMap = new Map<number, BlockType>()

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wx = worldX + x
      const wz = worldZ + z
      const topY = heightmap[x][z]
      const biome = getResolvedBiome(wx, wz)

      for (let y = 0; y <= topY; y++) {
        let type =
          y === topY
            ? getSurfaceBlockAt(wx, wz, biome, topY)
            : getBlockTypeAt(biome, y, topY)
        const mod = blockModifications.get(blockKeyString(wx, y, wz))
        if (mod === 'air') continue
        if (mod !== undefined) type = mod
        if (type === 'water') continue
        voxelMap.set(localKey(x, y, z), type)
      }
    }
  }

  const group = new THREE.Group()
  const minX = worldX
  const minZ = worldZ
  const maxX = worldX + CHUNK_SIZE - 1
  const maxZ = worldZ + CHUNK_SIZE - 1
  const treePlacementCache = new Map<string, number>()
  const forestDensityCache = new Map<string, number>()
  for (let twx = minX; twx <= maxX; twx++) {
    for (let twz = minZ; twz <= maxZ; twz++) {
      treePlacementCache.set(`${twx},${twz}`, getTreePlacement(twx, twz))
      forestDensityCache.set(`${twx},${twz}`, getForestDensity(twx, twz))
    }
  }
  const treeCaches: TreeNoiseCaches = {
    treePlacement: treePlacementCache,
    forestDensity: forestDensityCache,
  }
  for (let twx = minX; twx <= maxX; twx++) {
    for (let twz = minZ; twz <= maxZ; twz++) {
      if (!shouldPlaceTree(twx, twz, treeCaches)) continue
      const baseY = getHeight(twx, twz)
      const { wood, leaves } = generateTree(twx, baseY, twz)
      for (const b of wood) {
        if (
          b.x >= worldX &&
          b.x < worldX + CHUNK_SIZE &&
          b.z >= worldZ &&
          b.z < worldZ + CHUNK_SIZE &&
          blockModifications.get(blockKeyString(b.x, b.y, b.z)) !== 'air'
        ) {
          voxelMap.set(localKey(b.x - worldX, b.y, b.z - worldZ), 'wood')
        }
      }
      for (const b of leaves) {
        if (
          b.x >= worldX &&
          b.x < worldX + CHUNK_SIZE &&
          b.z >= worldZ &&
          b.z < worldZ + CHUNK_SIZE &&
          blockModifications.get(blockKeyString(b.x, b.y, b.z)) !== 'air' &&
          b.y > getHeight(b.x, b.z)
        ) {
          voxelMap.set(localKey(b.x - worldX, b.y, b.z - worldZ), 'leaves')
        }
      }
    }
  }

  const voxelMapEntries = Array.from(voxelMap.entries()) as Array<[number, BlockType]>
  const positionsByType = buildPositionsByType(worldX, worldZ, voxelMapEntries)
  const blockPositionsByType = new Map<BlockType, BlockPos[]>()
  group.userData = { chunkKeyNum: keyNum, cx: chunkX, cz: chunkZ }

  // Torches are stored in voxel data but rendered as custom meshes + lights (not instanced cubes).
  removeTorchesInChunk({ chunkKeyNum: keyNum, torchContainer: ctx.torchContainer, placedTorches: ctx.placedTorches })
  for (const [blockType, positions] of positionsByType) {
    const visible = filterVisibleBlocks(worldX, worldZ, voxelMap, positions)
    blockPositionsByType.set(blockType, visible)
    if (blockType === 'torch' || isWallTorchBlockType(blockType)) {
      for (const p of visible) {
        placeTorchSystem({
          bx: p.x,
          by: p.y,
          bz: p.z,
          blockType: blockType === 'torch' ? 'torch' : (blockType as any),
          preferredNormal: undefined,
          chunkKeyNum: keyNum,
          torchContainer: ctx.torchContainer,
          placedTorches: ctx.placedTorches,
          getBlockAt,
        })
      }
      continue
    }
    // tall_grass is rendered only via getTallGrassPositions + addTallGrassLayer below.
    if (blockType === 'tall_grass') continue
    // Flowers and fern use cross geometry (same as in chunk-apply).
    if (CROSS_GEOMETRY_BLOCK_TYPES.includes(blockType)) {
      const mesh = addCrossGeometryLayer(group, visible, getMaterialForBlockType(blockType), {
        chunkKeyNum: keyNum,
        blockType,
      })
      if (mesh) {
        setInstanceLightLevels(mesh, visible, ctx.getLightAt)
        if (ctx.grassColormapData) {
          setGrassInstanceColors(mesh, visible, getResolvedBiome, ctx.grassColormapData)
        }
      }
      continue
    }
    const mesh = addInstancedLayer(group, visible, getMaterialForBlockType(blockType), {
      chunkKeyNum: keyNum,
      blockType,
    })
    if (mesh) {
      setInstanceLightLevels(mesh, visible, ctx.getLightAt)
      if ((blockType === 'grass' || blockType === 'grass_savanna') && ctx.grassColormapData) {
        setGrassInstanceColors(mesh, visible, getResolvedBiome, ctx.grassColormapData)
      }
      if (FOLIAGE_BLOCK_TYPES.includes(blockType) && ctx.foliageColormapData) {
        setFoliageInstanceColors(mesh, visible, getResolvedBiome, ctx.foliageColormapData)
      }
    }
  }

  const tallGrassPositions = getTallGrassPositions(
    worldX,
    worldZ,
    voxelMap,
    blockPositionsByType,
    getResolvedBiome,
  )
  if (ctx.tallGrassMaterial && tallGrassPositions.length > 0) {
    const tallGrassMesh = addTallGrassLayer(group, tallGrassPositions, ctx.tallGrassMaterial)
    if (tallGrassMesh) {
      setInstanceLightLevels(tallGrassMesh, tallGrassPositions, ctx.getLightAt)
      if (ctx.grassColormapData) {
        setGrassInstanceColors(
          tallGrassMesh,
          tallGrassPositions,
          getResolvedBiome,
          ctx.grassColormapData,
        )
      }
    }
  }

  const waterGeo = buildChunkWaterGeometry(worldX, worldZ, heightmap)
  if (waterGeo) {
    const waterMesh = new THREE.Mesh(waterGeo, getMaterialForBlockType('water'))
    waterMesh.castShadow = false
    waterMesh.receiveShadow = true
    waterMesh.renderOrder = 2
    waterMesh.frustumCulled = true
    group.add(waterMesh)
  }

  ctx.scene.add(group)
  const data: ChunkData = {
    group,
    cx: chunkX,
    cz: chunkZ,
    voxelMap,
    blockPositionsByType,
  }
  chunks.set(keyNum, data)
  ctx.raycastMeshCache.markDirty()
  ctx.frustumDirty = true
  return data
}

/**
 * When it's snowing, accumulate time and occasionally grow snow layers.
 * Snow is valid per position: at (bx, bz) it snows if that position is in a cold biome
 * (or snowForced). Candidates are spread across all loaded chunks (same biome = snow there too).
 */
export function tryUpdateSnowAccumulation(
  ctx: ChunkSyncContext,
  dt: number,
  _playerX: number,
  _playerZ: number,
  snowForced: boolean | null,
  waterSurfaceY: number,
): void {
  if (waterSurfaceY >= WORLD_HEIGHT) return

  _snowGrowthAccumulator += dt
  if (_snowGrowthAccumulator < SNOW_GROWTH_INTERVAL_SEC) return
  _snowGrowthAccumulator = 0

  const loadedChunkKeys = Array.from(chunks.keys())
  if (loadedChunkKeys.length === 0) return

  /** Chunks that were modified -> set of affected block types for refresh. */
  const chunksToRefresh = new Map<number, Set<BlockType>>()

  for (let c = 0; c < SNOW_GROWTH_CANDIDATES_PER_INTERVAL; c++) {
    const keyNum = loadedChunkKeys[Math.floor(Math.random() * loadedChunkKeys.length)]
    const data = chunks.get(keyNum)
    if (!data) continue

    const lx = Math.floor(Math.random() * CHUNK_SIZE)
    const lz = Math.floor(Math.random() * CHUNK_SIZE)
    const bx = data.cx * CHUNK_SIZE + lx
    const bz = data.cz * CHUNK_SIZE + lz

    const isSnowingHere = snowForced === true || COLD_BIOMES.has(getResolvedBiome(bx, bz))
    if (!isSnowingHere) continue

    let topY = -1
    let topType: BlockType | 'air' | null = null
    for (let by = WORLD_HEIGHT - 1; by >= 0; by--) {
      const t = getBlockAt(bx, by, bz)
      if (t !== null && t !== 'air' && isBlockTypeSolid(t as BlockType)) {
        topY = by
        topType = t as BlockType
        break
      }
    }
    if (topY < 0 || topType === null) continue

    const above = topY + 1 < WORLD_HEIGHT ? getBlockAt(bx, topY + 1, bz) : null

    let affectedBlockTypes = chunksToRefresh.get(keyNum)
    if (!affectedBlockTypes) {
      affectedBlockTypes = new Set<BlockType>()
      chunksToRefresh.set(keyNum, affectedBlockTypes)
    }

    if (BLOCKS_SNOW_CAN_LAY_ON.has(topType) && (above === null || above === 'air')) {
      const ny = topY + 1
      const newType: BlockType = 'snow_layer_1'
      blockModifications.set(blockKeyString(bx, ny, bz), newType)
      const lk = localKey(lx, ny, lz)
      data.voxelMap.set(lk, newType)
      invalidateColumnHeight(bx, bz)
      affectedBlockTypes.add(newType)
      continue
    }

    const snowLayerMatch = /^snow_layer_([1-7])$/.exec(topType)
    if (snowLayerMatch != null) {
      const k = parseInt(snowLayerMatch[1], 10)
      const newType = `snow_layer_${k + 1}` as BlockType
      blockModifications.set(blockKeyString(bx, topY, bz), newType)
      const lk = localKey(lx, topY, lz)
      data.voxelMap.set(lk, newType)
      invalidateColumnHeight(bx, bz)
      affectedBlockTypes.add(topType)
      affectedBlockTypes.add(newType)
    }
  }

  for (const [keyNum, affectedBlockTypes] of chunksToRefresh) {
    const data = chunks.get(keyNum)
    if (data && affectedBlockTypes.size > 0) {
      refreshChunkVisibleMeshes(ctx, data, affectedBlockTypes)
    }
  }
}

export function getRaycastMeshes(
  raycastMeshCache: RaycastMeshCache,
): Array<THREE.InstancedMesh | THREE.Mesh> {
  return raycastMeshCache.get(chunks)
}

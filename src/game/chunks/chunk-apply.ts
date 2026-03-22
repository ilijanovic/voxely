import * as THREE from 'three'
import type { Biome, BlockPos, BlockType, ChunkData } from '../../types'
import type { ChunkDataPayload } from '../../terrain-core'
import { ALL_BIOMES, idToType, CARVED_ID } from '../../terrain-core'
import {
  CHUNK_SIZE,
  WATER_BLOCK_HEIGHT,
  WATER_LEVEL,
  WATER_PLANE_Y_OFFSET,
  WORLD_HEIGHT,
  WORLD_MIN_Y,
} from '../../constants'
import { columnCacheKey, columnHeightCache, localKey, chunkKeyNumeric } from '../../chunk-runtime'
import {
  sharedBlockGeometry,
  sharedTallGrassGeometry,
  getStairsGeometry,
  getFenceGeometry,
  type StairFacing,
  type StairsHalf,
  FOLIAGE_BLOCK_TYPES,
  getMaterialForBlockType,
  setFoliageInstanceColors,
  setGrassInstanceColors,
  isSharedBlockOrSnowLayerGeometry,
} from '../../block-materials'
import {
  isOccludingBlock as isBlockTypeOccluding,
  getBlockHeight,
  isFenceBlock,
  getFenceConnectionMask,
  isPlacedStairsVariant,
  getStairsFacingAndHalfFromId,
} from '../../block-registry'
import { filterVisibleBlocks } from './visible-blocks'
import { sharedWaterPlaneGeometry } from '../../block-materials'
import { getBlockAt } from '../../chunk-runtime'
import { placeTorch, removeTorchesInChunk, isWallTorchBlockType } from '../world-interactions/torches'
import { CROSS_GEOMETRY_BLOCK_TYPES } from './cross-geometry-block-types'
import { getGrassTopVariantMaterialKeys, partitionPositionsByVariantMaterialKey } from './grass-material-variants'
import { addWorkerGeometryLayerMesh } from './worker-layer-mesh'

export type ChunkApplyDeps = {
  chunks: Map<number, ChunkData>
  pendingChunkKeys: Set<number>
  grassColormapData: ImageData | null
  foliageColormapData: ImageData | null
  tallGrassMaterial: THREE.MeshStandardMaterial | null
  getResolvedBiome: (x: number, z: number) => Biome
  torchContainer: THREE.Group | undefined
  placedTorches: import('../world-interactions/torches').PlacedTorch[]
  onChunkAdded?: (data: ChunkData) => void
  onChunkChanged?: () => void
}

const _matrix = new THREE.Matrix4()
const _position = new THREE.Vector3()

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

function addInstancedLayer(
  group: THREE.Group,
  positions: BlockPos[],
  material: THREE.Material | THREE.Material[],
  userData?: { chunkKeyNum: number; blockType: BlockType },
): THREE.InstancedMesh | null {
  const count = positions.length
  if (count === 0) return null
  const mesh = new THREE.InstancedMesh(sharedBlockGeometry, material as THREE.Material, count)
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

function addStairsInstancedLayer(
  group: THREE.Group,
  positions: BlockPos[],
  facing: StairFacing,
  half: StairsHalf,
  material: THREE.Material | THREE.Material[],
  userData?: { chunkKeyNum: number; blockType: BlockType },
): THREE.InstancedMesh | null {
  const count = positions.length
  if (count === 0) return null
  const mesh = new THREE.InstancedMesh(getStairsGeometry(facing, half), material as THREE.Material, count)
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

/** Decode flat voxel buffer into voxelMap (skips air and carved). */
export function buildVoxelMapFromBuffer(buffer: Uint8Array): Map<number, BlockType> {
  const voxelMap = new Map<number, BlockType>()
  for (let i = 0; i < buffer.length; i++) {
    const blockID = buffer[i]
    if (blockID === 0 || blockID === CARVED_ID) continue
    const blockType = idToType(blockID) as BlockType
    if (blockType === 'air') continue
    const lx = i % CHUNK_SIZE
    const ly = Math.floor(i / CHUNK_SIZE) % WORLD_HEIGHT
    const lz = Math.floor(i / (CHUNK_SIZE * WORLD_HEIGHT))
    const key = lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * WORLD_HEIGHT
    voxelMap.set(key, blockType)
  }
  return voxelMap
}

export function buildPositionsByTypeFromVisibleKeys(
  visible: NonNullable<ChunkDataPayload['visibleBlockKeysByType']>,
  worldX: number,
  worldZ: number,
): Map<BlockType, BlockPos[]> {
  const out = new Map<BlockType, BlockPos[]>()
  for (const entry of visible) {
    const blockType = idToType(entry.blockTypeId) as BlockType
    if (blockType === 'air') continue
    const keys = entry.keys
    const positions: BlockPos[] = new Array(keys.length)
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      const lx = k % CHUNK_SIZE
      const ly = Math.floor(k / CHUNK_SIZE) % WORLD_HEIGHT
      const lz = Math.floor(k / (CHUNK_SIZE * WORLD_HEIGHT))
      positions[i] = { x: worldX + lx, y: WORLD_MIN_Y + ly, z: worldZ + lz }
    }
    out.set(blockType, positions)
  }
  return out
}

const GRASS_BLOCK_TYPES_FOR_TALL_GRASS: BlockType[] = ['grass', 'grass_savanna']
const TALL_GRASS_SPAWN_CHANCE = 0.05
/** Higher chance in forest/jungle for denser undergrowth when using procedural tall grass. */
const TALL_GRASS_SPAWN_CHANCE_WOODLAND = 0.12
const TALL_GRASS_Y_OFFSET = -0.02

function isPlacedStairsBlockType(blockType: BlockType): boolean {
  return isPlacedStairsVariant(blockType)
}

/**
 * Returns a block lookup that prefers the current chunk's voxelMap for positions inside the chunk,
 * and falls back to getBlockAt for neighbors in other chunks (so fence connection is correct on first apply).
 */
function makeGetBlockForChunk(
  worldX: number,
  worldZ: number,
  voxelMap: Map<number, BlockType>,
  getBlockAt: (bx: number, by: number, bz: number) => BlockType | null,
): (bx: number, by: number, bz: number) => BlockType {
  return (bx: number, by: number, bz: number) => {
    const lx = bx - worldX
    const lz = bz - worldZ
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
      const ly = by - WORLD_MIN_Y
      const key = localKey(lx, ly, lz)
      return voxelMap.get(key) ?? 'air'
    }
    return getBlockAt(bx, by, bz) ?? 'air'
  }
}

function addFenceInstancedLayer(
  group: THREE.Group,
  positions: BlockPos[],
  mask: number,
  material: THREE.Material | THREE.Material[],
  userData?: { chunkKeyNum: number; blockType: BlockType },
): THREE.InstancedMesh | null {
  const count = positions.length
  if (count === 0) return null
  const mesh = new THREE.InstancedMesh(
    getFenceGeometry(mask),
    material as THREE.Material,
    count,
  )
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

function pseudoRandomFromBlockPos(seed: number, x: number, y: number, z: number): number {
  let h = seed >>> 0
  h ^= Math.imul((x | 0) >>> 0, 374761393)
  h = (h << 13) | (h >>> 19)
  h ^= Math.imul((y | 0) >>> 0, 668265263)
  h = (h << 11) | (h >>> 21)
  h ^= Math.imul((z | 0) >>> 0, 2147483647)
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  return ((h >>> 0) & 0xffffffff) / 0x100000000
}

/**
 * Optional: when provided, woodland biomes (forest, jungle) use a higher spawn chance for procedural tall grass.
 */
export function getTallGrassPositions(
  seed: number,
  worldX: number,
  worldZ: number,
  voxelMap: Map<number, BlockType>,
  positionsByType: Map<BlockType, BlockPos[]>,
  getBiome?: (x: number, z: number) => import('../../types').Biome,
): BlockPos[] {
  const out: BlockPos[] = []
  for (const blockType of GRASS_BLOCK_TYPES_FOR_TALL_GRASS) {
    const positions = positionsByType.get(blockType)
    if (!positions) continue
    for (const p of positions) {
      const lx = p.x - worldX
      const lz = p.z - worldZ
      const keyAbove = localKey(lx, p.y + 1 - WORLD_MIN_Y, lz)
      if (voxelMap.has(keyAbove)) continue
      const chance =
        getBiome && (getBiome(p.x, p.z) === 'forest' || getBiome(p.x, p.z) === 'jungle')
          ? TALL_GRASS_SPAWN_CHANCE_WOODLAND
          : TALL_GRASS_SPAWN_CHANCE
      if (pseudoRandomFromBlockPos(seed, p.x, p.y, p.z) > chance) continue
      out.push(p)
    }
  }
  const workerGrass = positionsByType.get('tall_grass' as BlockType)
  if (workerGrass) {
    for (const p of workerGrass) {
      out.push({ x: p.x, y: p.y - 1, z: p.z })
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

function addTallGrassLayer(
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

export function buildChunkWaterGeometry(
  worldX: number,
  worldZ: number,
  heightmap: number[][] | Float32Array,
  biomeMapBuffer?: Uint8Array,
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
      const topY = Array.isArray(heightmap) ? heightmap[lx][lz] : heightmap[lx + lz * CHUNK_SIZE]
      const biome =
        biomeMapBuffer && biomeMapBuffer.length > lx + lz * CHUNK_SIZE
          ? ALL_BIOMES[biomeMapBuffer[lx + lz * CHUNK_SIZE]]
          : null
      const isRiverAtSeaLevel =
        topY === WATER_LEVEL && (biome === 'river' || biome === 'frozen_river')
      if (topY >= WATER_LEVEL && !isRiverAtSeaLevel) continue
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

/**
 * Apply chunk data from the Web Worker to the scene (build meshes, ChunkData, add to chunks/scene).
 */
export function applyChunkPayload(
  scene: THREE.Scene,
  payload: ChunkDataPayload,
  deps: ChunkApplyDeps,
  worldSeed: number,
): void {
  const keyNum = chunkKeyNumeric(payload.chunkX, payload.chunkZ)
  removeTorchesInChunk({
    chunkKeyNum: keyNum,
    torchContainer: deps.torchContainer,
    placedTorches: deps.placedTorches,
  })
  let wasReplacing = false
  if (deps.chunks.has(keyNum)) {
    wasReplacing = true
    const existing = deps.chunks.get(keyNum)!
    scene.remove(existing.group)
    existing.group.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh &&
        obj.geometry &&
        !isSharedBlockOrSnowLayerGeometry(obj.geometry)
      ) {
        obj.geometry.dispose()
      }
    })
    deps.chunks.delete(keyNum)
  }

  const worldX = payload.chunkX * CHUNK_SIZE
  const worldZ = payload.chunkZ * CHUNK_SIZE
  const group = new THREE.Group()
  group.userData = { chunkKeyNum: keyNum, cx: payload.chunkX, cz: payload.chunkZ }

  const voxelMap = buildVoxelMapFromBuffer(payload.buffer)

  const blockPositionsByType = payload.visibleBlockKeysByType
    ? buildPositionsByTypeFromVisibleKeys(payload.visibleBlockKeysByType, worldX, worldZ)
    : new Map<BlockType, BlockPos[]>()

  if (payload.geometryLayers && payload.geometryLayers.length > 0) {
    for (const layer of payload.geometryLayers) {
      const blockType = idToType(layer.blockTypeId) as BlockType
      if (blockType === 'air') continue
      // Torches use a custom mesh + light; skip voxel geometry for torch blocks.
      if (blockType === 'torch' || isWallTorchBlockType(blockType)) continue
      // Keep instancing path for blocks that rely on per-instance colormap tint.
      if (
        blockType === 'grass' ||
        blockType === 'grass_savanna' ||
        FOLIAGE_BLOCK_TYPES.includes(blockType)
      ) {
        continue
      }
      // Flowers, fern, tall_grass use cross geometry (not full cube); skip so they are rendered below.
      if (CROSS_GEOMETRY_BLOCK_TYPES.includes(blockType) || blockType === 'tall_grass') continue
      // Stairs are rendered via instancing with custom geometry below.
      if (isPlacedStairsBlockType(blockType)) continue
      // Fences are rendered via instancing with connection-dependent geometry below.
      if (isFenceBlock(blockType)) continue
      addWorkerGeometryLayerMesh(group, layer, getMaterialForBlockType(blockType), {
        chunkKeyNum: keyNum,
        blockType,
      })
    }
  }

  // Fallback / special-case instancing (colormap tint, or if no worker geometry available).
  if (
    !payload.geometryLayers ||
    payload.geometryLayers.length === 0 ||
    blockPositionsByType.size > 0
  ) {
    const positionsSource =
      blockPositionsByType.size > 0
        ? blockPositionsByType
        : (() => {
            const positionsByType = new Map<BlockType, BlockPos[]>()
            for (let i = 0; i < payload.buffer.length; i++) {
              const blockID = payload.buffer[i]
              if (blockID === 0 || blockID === CARVED_ID) continue
              const blockType = idToType(blockID) as BlockType
              if (blockType === 'air') continue
              const lx = i % CHUNK_SIZE
              const ly = Math.floor(i / CHUNK_SIZE) % WORLD_HEIGHT
              const lz = Math.floor(i / (CHUNK_SIZE * WORLD_HEIGHT))
              const pos: BlockPos = { x: worldX + lx, y: WORLD_MIN_Y + ly, z: worldZ + lz }
              const arr = positionsByType.get(blockType) ?? []
              arr.push(pos)
              positionsByType.set(blockType, arr)
            }
            return positionsByType
          })()

    const getBlock = makeGetBlockForChunk(worldX, worldZ, voxelMap, (bx, by, bz) =>
      getBlockAt(bx, by, bz),
    )

    for (const [blockType, positions] of positionsSource) {
      let visible = positions
      if (!payload.visibleBlockKeysByType) {
        visible = filterVisibleBlocks({
          worldX,
          worldZ,
          worldMinY: WORLD_MIN_Y,
          chunkSize: CHUNK_SIZE,
          worldHeight: WORLD_HEIGHT,
          voxelMap,
          positions,
          localKey,
          isOccludingBlock: isBlockTypeOccluding,
        })
      }
      blockPositionsByType.set(blockType, visible)
      if (blockType === 'torch' || isWallTorchBlockType(blockType)) {
        for (const p of visible) {
          placeTorch({
            bx: p.x,
            by: p.y,
            bz: p.z,
            blockType: blockType === 'torch' ? 'torch' : (blockType as any),
            preferredNormal: undefined,
            chunkKeyNum: keyNum,
            torchContainer: deps.torchContainer,
            placedTorches: deps.placedTorches,
            getBlockAt,
          })
        }
        continue
      }
      if (payload.geometryLayers && payload.geometryLayers.length > 0) {
        // Only run instancing for tinted blocks, cross-geometry blocks, fences, and stairs.
        const isTintedOrCrossOrSpecial =
          blockType === 'grass' ||
          blockType === 'grass_savanna' ||
          FOLIAGE_BLOCK_TYPES.includes(blockType) ||
          CROSS_GEOMETRY_BLOCK_TYPES.includes(blockType) ||
          blockType === 'tall_grass' ||
          isFenceBlock(blockType) ||
          isPlacedStairsBlockType(blockType)
        if (!isTintedOrCrossOrSpecial) continue
      }
      // tall_grass is rendered via getTallGrassPositions + addTallGrassLayer below.
      if (blockType === 'tall_grass') continue
      // Flowers and fern use cross geometry (same as tall grass mesh).
      if (CROSS_GEOMETRY_BLOCK_TYPES.includes(blockType)) {
        const mesh = addCrossGeometryLayer(group, visible, getMaterialForBlockType(blockType), {
          chunkKeyNum: keyNum,
          blockType,
        })
        if (mesh && deps.grassColormapData) {
          setGrassInstanceColors(mesh, visible, deps.getResolvedBiome, deps.grassColormapData)
        }
        continue
      }
      if (isFenceBlock(blockType)) {
        const byMask = new Map<number, BlockPos[]>()
        for (const p of visible) {
          const mask = getFenceConnectionMask(p.x, p.y, p.z, getBlock)
          const arr = byMask.get(mask) ?? []
          arr.push(p)
          byMask.set(mask, arr)
        }
        for (const [mask, fencePositions] of byMask) {
          addFenceInstancedLayer(
            group,
            fencePositions,
            mask,
            getMaterialForBlockType(blockType),
            { chunkKeyNum: keyNum, blockType },
          )
        }
        continue
      }
      if (isPlacedStairsBlockType(blockType)) {
        const state = getStairsFacingAndHalfFromId(blockType)
        if (state) {
          addStairsInstancedLayer(
            group,
            visible,
            state.facing,
            state.half,
            getMaterialForBlockType(blockType),
            { chunkKeyNum: keyNum, blockType },
          )
        }
        continue
      }
      if (blockType === 'grass' || blockType === 'grass_savanna') {
        const variantKeys = getGrassTopVariantMaterialKeys()
        if (variantKeys.length > 0) {
          const buckets = partitionPositionsByVariantMaterialKey(visible, variantKeys)
          for (const [materialKey, bucketPositions] of buckets) {
            const mesh = addInstancedLayer(group, bucketPositions, getMaterialForBlockType(materialKey as any), {
              chunkKeyNum: keyNum,
              blockType,
            })
            if (mesh && deps.grassColormapData) {
              setGrassInstanceColors(mesh, bucketPositions, deps.getResolvedBiome, deps.grassColormapData)
            }
          }
          continue
        }
      }

      const mesh = addInstancedLayer(group, visible, getMaterialForBlockType(blockType), {
        chunkKeyNum: keyNum,
        blockType,
      })
      if (mesh && (blockType === 'grass' || blockType === 'grass_savanna') && deps.grassColormapData) {
        setGrassInstanceColors(mesh, visible, deps.getResolvedBiome, deps.grassColormapData)
      }
      if (mesh && FOLIAGE_BLOCK_TYPES.includes(blockType) && deps.foliageColormapData) {
        setFoliageInstanceColors(mesh, visible, deps.getResolvedBiome, deps.foliageColormapData)
      }
    }
  }

  const tallGrassPositions = getTallGrassPositions(
    worldSeed,
    worldX,
    worldZ,
    voxelMap,
    blockPositionsByType,
    deps.getResolvedBiome,
  )
  if (deps.tallGrassMaterial && tallGrassPositions.length > 0) {
    const tallGrassMesh = addTallGrassLayer(group, tallGrassPositions, deps.tallGrassMaterial)
    if (tallGrassMesh && deps.grassColormapData) {
      setGrassInstanceColors(
        tallGrassMesh,
        tallGrassPositions,
        deps.getResolvedBiome,
        deps.grassColormapData,
      )
    }
  }

  // Flowing water blocks (water_source, water_flowing_1..7) from voxel buffer – instanced plane per block
  const WATER_BLOCK_TYPES: BlockType[] = [
    'water_source',
    'water_flowing_1',
    'water_flowing_2',
    'water_flowing_3',
    'water_flowing_4',
    'water_flowing_5',
    'water_flowing_6',
    'water_flowing_7',
  ]
  for (const waterType of WATER_BLOCK_TYPES) {
    const positions = blockPositionsByType.get(waterType)
    if (!positions || positions.length === 0) continue
    const waterHeight = getBlockHeight(waterType)
    const mesh = new THREE.InstancedMesh(
      sharedWaterPlaneGeometry,
      getMaterialForBlockType(waterType) as THREE.Material,
      positions.length,
    )
    mesh.count = positions.length
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]
      _position.set(p.x + 0.5, p.y + waterHeight, p.z + 0.5)
      _matrix.makeTranslation(_position.x, _position.y, _position.z)
      mesh.setMatrixAt(i, _matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = false
    mesh.receiveShadow = true
    mesh.userData = { chunkKeyNum: keyNum, blockType: waterType }
    group.add(mesh)
  }

  const waterSource = payload.heightmapBuffer ?? payload.heightmap
  const waterGeo = waterSource
    ? buildChunkWaterGeometry(worldX, worldZ, waterSource, payload.biomeMapBuffer)
    : null
  if (waterGeo) {
    const waterMesh = new THREE.Mesh(waterGeo, getMaterialForBlockType('water'))
    waterMesh.castShadow = false
    waterMesh.receiveShadow = true
    waterMesh.renderOrder = 2
    waterMesh.frustumCulled = true
    group.add(waterMesh)
  }

  const heightmapBuffer =
    payload.heightmapBuffer ??
    (payload.heightmap && payload.heightmap.length > 0
      ? (() => {
          const buf = new Float32Array(CHUNK_SIZE * CHUNK_SIZE)
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
              buf[lx + lz * CHUNK_SIZE] = payload.heightmap![lx][lz]
            }
          }
          return buf
        })()
      : undefined)

  const data: ChunkData = {
    group,
    cx: payload.chunkX,
    cz: payload.chunkZ,
    voxelMap,
    blockPositionsByType,
    heightmapBuffer,
    biomeMapBuffer: payload.biomeMapBuffer,
  }
  deps.chunks.set(keyNum, data)
  if (heightmapBuffer) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const surfaceY = Math.floor(heightmapBuffer[lx + lz * CHUNK_SIZE])
        columnHeightCache.set(columnCacheKey(worldX + lx, worldZ + lz), surfaceY)
      }
    }
  }
  scene.add(group)
  if (!wasReplacing) deps.onChunkAdded?.(data)
  deps.pendingChunkKeys.delete(keyNum)
  deps.onChunkChanged?.()
}

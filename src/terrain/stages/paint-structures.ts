/**
 * Paints structure templates (village, temple) and village walkways into chunk voxelMap.
 * Used by the features stage (stage 8); reads ctx.structureOrigins set by structures_starts.
 */
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../constants'
import type { WorldPoi } from '../../world-pois'
import { getFixedVillageOriginsInChunk } from '../../world-pois'
import { isAirOrCarved, localKey, typeToId } from '../block-ids'
import type { ChunkContext } from '../pipeline-types'
import type { StructureOrigin } from '../structures/origins'
import { getStructureOriginsInChunk } from '../structures/origins'
import {
  getVillageBlocks,
  getVillageHouseSizeFromSeed,
  getHouseDimensions,
  getDoorPosition,
  getVillageWalkwayBlocks,
  type VillageDoorPosition,
} from '../structures/templates/village'
import { getTempleBlocks } from '../structures/templates/temple'

const TEMPLE_SIZE = 6

/** Max distance (blocks) between two village doors to be considered the same village for walkways. */
const VILLAGE_WALKWAY_CLUSTER_RADIUS = 80

const CLUSTER_RADIUS_SQ = VILLAGE_WALKWAY_CLUSTER_RADIUS * VILLAGE_WALKWAY_CLUSTER_RADIUS

/** Torch Y offset from the house floor so it appears on the wall near the door. */
const DOOR_TORCH_Y_OFFSET = 2

/** Village walkway lantern: number of solid post blocks below the torch. */
const WALKWAY_LANTERN_POST_HEIGHT = 2

/** Village walkway lantern: torch sits this many blocks above the gravel block Y. */
const WALKWAY_LANTERN_TORCH_Y_OFFSET = 1 + WALKWAY_LANTERN_POST_HEIGHT

/** Approximate spacing (in blocks) between lanterns along village walkways. */
const WALKWAY_LANTERN_SPACING_BLOCKS = 9

const WALKWAY_LANTERN_SPACING_SQ =
  WALKWAY_LANTERN_SPACING_BLOCKS * WALKWAY_LANTERN_SPACING_BLOCKS

/** Post material options for village walkway lanterns (two blocks high). */
const WALKWAY_LANTERN_POST_BLOCKS = ['wood', 'stone_bricks'] as const

/** Village center plaza radius in blocks (diamond-ish). */
const VILLAGE_PLAZA_RADIUS = 5

/** Well (Brunnen) outer half-size in blocks; total footprint (2*WELL_OUTER_HALF+1)². */
const WELL_OUTER_HALF = 2

/** Well water area: 2×2 cells centered (dx, dz in [-1, 0] × [-1, 0]). */
const WELL_WATER_HALF = 1

/**
 * Places a guaranteed torch next to a village house door (best-effort within chunk bounds and empty cells).
 * The torch is placed on the house wall next to the door so it's visible from outside.
 */
function paintGuaranteedDoorTorch(
  ctx: ChunkContext,
  deps: PaintStructuresDeps,
  origin: StructureOrigin,
  houseSize: import('../structures/origins').VillageHouseSize,
): void {
  const { worldX, worldZ, voxelMap } = ctx
  const { seed } = deps

  const { widthZ } = getHouseDimensions(origin.ox, origin.oz, houseSize)
  const halfZ = Math.floor((widthZ - 1) / 2)
  const minZ = origin.oz - halfZ
  const maxZ = minZ + widthZ - 1
  const { doorX, doorZ } = getDoorPosition(origin.ox, origin.oz, houseSize)

  const sideCandidates: Array<{ x: number; z: number }> =
    doorZ === minZ || doorZ === maxZ
      ? [
          { x: doorX - 1, z: doorZ },
          { x: doorX + 1, z: doorZ },
        ]
      : [
          { x: doorX, z: doorZ - 1 },
          { x: doorX, z: doorZ + 1 },
        ]

  // Deterministic preference so villages don't all put torches on the same side.
  const preferSecond = (((seed + Math.floor(origin.ox) * 374761393 + Math.floor(origin.oz) * 668265263) >>> 0) & 1) === 1
  const ordered = preferSecond
    ? [sideCandidates[1], sideCandidates[0]]
    : [sideCandidates[0], sideCandidates[1]]

  const torchId = typeToId('torch')
  for (const c of ordered) {
    const by = origin.oy + DOOR_TORCH_Y_OFFSET
    if (by < 0 || by >= WORLD_HEIGHT) continue
    if (c.x < worldX || c.x >= worldX + CHUNK_SIZE) continue
    if (c.z < worldZ || c.z >= worldZ + CHUNK_SIZE) continue
    const lx = c.x - worldX
    const lz = c.z - worldZ
    const key = localKey(lx, by, lz)
    voxelMap[key] = torchId
    return
  }
}

/**
 * Deterministic 32-bit unsigned hash for a world position and seed.
 * Used for stable placement decisions across sessions.
 */
function hashSeededXZ(seed: number, x: number, z: number): number {
  let h = (seed + Math.floor(x) * 374761393 + Math.floor(z) * 668265263) >>> 0
  h = (h ^ (h >> 13)) * 1274126177
  h ^= h >> 16
  return h >>> 0
}

/**
 * Paints a small village plaza around (centerX, centerZ): gravel/grass_path ring and a Minecraft-style
 * well (Brunnen) with 2×2 water, raised stone rim, and corner posts. Only paints inside the current
 * chunk bounds. Uses isAirOrCarved checks to avoid overwriting houses.
 */
function paintVillagePlaza(
  ctx: ChunkContext,
  deps: PaintStructuresDeps,
  centerX: number,
  centerZ: number,
  cluster: VillageDoorPosition[],
): void {
  const { worldX, worldZ, voxelMap } = ctx
  const { seed, getHeight } = deps

  let minDoorX = cluster[0]?.doorX ?? Math.round(centerX)
  let maxDoorX = minDoorX
  let minDoorZ = cluster[0]?.doorZ ?? Math.round(centerZ)
  let maxDoorZ = minDoorZ
  for (const d of cluster) {
    minDoorX = Math.min(minDoorX, d.doorX)
    maxDoorX = Math.max(maxDoorX, d.doorX)
    minDoorZ = Math.min(minDoorZ, d.doorZ)
    maxDoorZ = Math.max(maxDoorZ, d.doorZ)
  }

  // Keep the plaza center inside the cluster bounds so small villages don't end up with an off-chunk center.
  const cx = Math.max(minDoorX, Math.min(maxDoorX, Math.round(centerX)))
  const cz = Math.max(minDoorZ, Math.min(maxDoorZ, Math.round(centerZ)))
  const centerY = Math.floor(getHeight(cx, cz))

  const gravelId = typeToId('gravel')
  const pathId = typeToId('grass_path')
  const stoneId = typeToId('stone')
  const stoneBricksId = typeToId('stone_bricks')
  const waterId = typeToId('water_source')
  const torchId = typeToId('torch')
  const woodId = typeToId('wood')
  const flowerIds = [typeToId('poppy'), typeToId('dandelion'), typeToId('azure_bluet')]

  const wellRimId = (hashSeededXZ(seed + 5555, cx, cz) & 1) === 1 ? stoneBricksId : stoneId

  // Place a plaza band around the center. Use a seeded pattern so villages don't look identical.
  for (let dx = -VILLAGE_PLAZA_RADIUS; dx <= VILLAGE_PLAZA_RADIUS; dx++) {
    for (let dz = -VILLAGE_PLAZA_RADIUS; dz <= VILLAGE_PLAZA_RADIUS; dz++) {
      const dist = Math.abs(dx) + Math.abs(dz)
      if (dist > VILLAGE_PLAZA_RADIUS) continue

      const wx = cx + dx
      const wz = cz + dz
      if (wx < worldX || wx >= worldX + CHUNK_SIZE) continue
      if (wz < worldZ || wz >= worldZ + CHUNK_SIZE) continue

      const by = Math.floor(getHeight(wx, wz))
      if (by < 0 || by >= WORLD_HEIGHT) continue

      // Don't paint inside house footprints.
      let inHouse = false
      for (const d of cluster) {
        if (wx >= d.minX && wx <= d.maxX && wz >= d.minZ && wz <= d.maxZ) {
          inHouse = true
          break
        }
      }
      if (inHouse) continue

      const lx = wx - worldX
      const lz = wz - worldZ
      const key = localKey(lx, by, lz)
      if (!isAirOrCarved(voxelMap[key])) continue

      const h = hashSeededXZ(seed + 1234, wx, wz)
      const inner = dist <= VILLAGE_PLAZA_RADIUS - 1
      const blockId = inner ? (h % 3 === 0 ? pathId : gravelId) : gravelId
      voxelMap[key] = blockId
    }
  }

  // Well (Brunnen): Minecraft-style 5×5 base with 2×2 water, raised rim, and corner posts.
  const wellCornerOffsets: Array<{ dx: number; dz: number }> = [
    { dx: -WELL_OUTER_HALF, dz: -WELL_OUTER_HALF },
    { dx: -WELL_OUTER_HALF, dz: WELL_OUTER_HALF },
    { dx: WELL_OUTER_HALF, dz: -WELL_OUTER_HALF },
    { dx: WELL_OUTER_HALF, dz: WELL_OUTER_HALF },
  ]
  for (let dx = -WELL_OUTER_HALF; dx <= WELL_OUTER_HALF; dx++) {
    for (let dz = -WELL_OUTER_HALF; dz <= WELL_OUTER_HALF; dz++) {
      const wx = cx + dx
      const wz = cz + dz
      if (wx < worldX || wx >= worldX + CHUNK_SIZE) continue
      if (wz < worldZ || wz >= worldZ + CHUNK_SIZE) continue
      const isWater =
        dx >= -WELL_WATER_HALF && dx <= 0 && dz >= -WELL_WATER_HALF && dz <= 0
      const by = centerY
      if (by < 0 || by >= WORLD_HEIGHT) continue
      const lx = wx - worldX
      const lz = wz - worldZ
      const key = localKey(lx, by, lz)
      const existing = voxelMap[key]
      if (!isAirOrCarved(existing) && existing !== gravelId && existing !== pathId) continue
      voxelMap[key] = isWater ? waterId : wellRimId
    }
  }
  for (let dx = -WELL_OUTER_HALF; dx <= WELL_OUTER_HALF; dx++) {
    for (let dz = -WELL_OUTER_HALF; dz <= WELL_OUTER_HALF; dz++) {
      const isWater =
        dx >= -WELL_WATER_HALF && dx <= 0 && dz >= -WELL_WATER_HALF && dz <= 0
      if (isWater) continue
      const wx = cx + dx
      const wz = cz + dz
      if (wx < worldX || wx >= worldX + CHUNK_SIZE) continue
      if (wz < worldZ || wz >= worldZ + CHUNK_SIZE) continue
      const by = centerY + 1
      if (by < 0 || by >= WORLD_HEIGHT) continue
      const lx = wx - worldX
      const lz = wz - worldZ
      const key = localKey(lx, by, lz)
      if (!isAirOrCarved(voxelMap[key])) continue
      voxelMap[key] = wellRimId
    }
  }
  for (const o of wellCornerOffsets) {
    const wx = cx + o.dx
    const wz = cz + o.dz
    if (wx < worldX || wx >= worldX + CHUNK_SIZE) continue
    if (wz < worldZ || wz >= worldZ + CHUNK_SIZE) continue
    const postId = (hashSeededXZ(seed + 6666, wx, wz) & 1) === 1 ? woodId : stoneBricksId
    for (let yOff = 1; yOff <= 2; yOff++) {
      const by = centerY + yOff
      if (by < 0 || by >= WORLD_HEIGHT) continue
      const lx = wx - worldX
      const lz = wz - worldZ
      const key = localKey(lx, by, lz)
      if (!isAirOrCarved(voxelMap[key])) continue
      voxelMap[key] = postId
    }
  }

  // Four simple plaza lanterns (short posts + torch) around the well for night readability.
  const lanternOffsets: Array<{ dx: number; dz: number }> = [
    { dx: 0, dz: VILLAGE_PLAZA_RADIUS - 1 },
    { dx: 0, dz: -(VILLAGE_PLAZA_RADIUS - 1) },
    { dx: VILLAGE_PLAZA_RADIUS - 1, dz: 0 },
    { dx: -(VILLAGE_PLAZA_RADIUS - 1), dz: 0 },
  ]
  for (const o of lanternOffsets) {
    const wx = cx + o.dx
    const wz = cz + o.dz
    if (wx < worldX || wx >= worldX + CHUNK_SIZE) continue
    if (wz < worldZ || wz >= worldZ + CHUNK_SIZE) continue
    const baseY = Math.floor(getHeight(wx, wz))
    const torchY = baseY + 3
    if (torchY < 0 || torchY >= WORLD_HEIGHT) continue
    const lx = wx - worldX
    const lz = wz - worldZ
    const post1Key = localKey(lx, baseY + 1, lz)
    const post2Key = localKey(lx, baseY + 2, lz)
    const torchKey = localKey(lx, torchY, lz)
    if (!isAirOrCarved(voxelMap[post1Key])) continue
    if (!isAirOrCarved(voxelMap[post2Key])) continue
    if (!isAirOrCarved(voxelMap[torchKey])) continue
    const postId = (hashSeededXZ(seed + 3333, wx, wz) & 1) === 1 ? stoneId : woodId
    voxelMap[post1Key] = postId
    voxelMap[post2Key] = postId
    voxelMap[torchKey] = torchId
  }

  // A few flowers near the plaza edge (deterministic, sparse).
  for (let dx = -VILLAGE_PLAZA_RADIUS; dx <= VILLAGE_PLAZA_RADIUS; dx++) {
    for (let dz = -VILLAGE_PLAZA_RADIUS; dz <= VILLAGE_PLAZA_RADIUS; dz++) {
      const dist = Math.abs(dx) + Math.abs(dz)
      if (dist !== VILLAGE_PLAZA_RADIUS) continue
      const wx = cx + dx
      const wz = cz + dz
      if (wx < worldX || wx >= worldX + CHUNK_SIZE) continue
      if (wz < worldZ || wz >= worldZ + CHUNK_SIZE) continue
      const h = hashSeededXZ(seed + 4444, wx, wz)
      if (h % 7 !== 0) continue
      const baseY = Math.floor(getHeight(wx, wz))
      const flowerY = baseY + 1
      if (flowerY < 0 || flowerY >= WORLD_HEIGHT) continue
      const lx = wx - worldX
      const lz = wz - worldZ
      const key = localKey(lx, flowerY, lz)
      if (!isAirOrCarved(voxelMap[key])) continue
      voxelMap[key] = flowerIds[h % flowerIds.length]
    }
  }
}

/**
 * Places lanterns adjacent to already-painted village gravel walkways.
 * Lantern = 2-block post + torch on top (best-effort; only places when space is free).
 */
function paintVillageWalkwayLanterns(
  ctx: ChunkContext,
  seed: number,
  walkwayBlocks: Array<{ bx: number; by: number; bz: number; block: import('../../types').BlockType }>,
): void {
  const { worldX, worldZ, voxelMap } = ctx

  const pathBlocks = walkwayBlocks.filter(
    (b) => b.block === 'gravel' || b.block === 'grass_path',
  )
  if (pathBlocks.length === 0) return

  const walkwaySet = new Set<string>()
  for (const p of pathBlocks) walkwaySet.add(`${p.bx},${p.bz}`)

  const torchId = typeToId('torch')
  const placed: Array<{ x: number; z: number }> = []

  function getPostIdFor(x: number, z: number): number {
    const h = hashSeededXZ(seed + 2222, x, z)
    const pick = WALKWAY_LANTERN_POST_BLOCKS[h % WALKWAY_LANTERN_POST_BLOCKS.length]
    return typeToId(pick)
  }

  function isFarEnough(x: number, z: number): boolean {
    for (const q of placed) {
      const dx = x - q.x
      const dz = z - q.z
      if (dx * dx + dz * dz < WALKWAY_LANTERN_SPACING_SQ) return false
    }
    return true
  }

  for (const p of pathBlocks) {
    const h = hashSeededXZ(seed, p.bx, p.bz)
    // Always try to place at least one lantern per walkway cluster if any valid spot exists.
    // After the first, thin placement out with a deterministic roll + spacing constraint.
    if (placed.length > 0) {
      const placeRoll = (h >>> 0) / 0xffffffff
      if (placeRoll > 1 / 6) continue
    }

    const chooseAlt = (h & 1) === 1
    const neighbors: Array<{ x: number; z: number }> = chooseAlt
      ? [
          { x: p.bx - 1, z: p.bz },
          { x: p.bx + 1, z: p.bz },
          { x: p.bx, z: p.bz - 1 },
          { x: p.bx, z: p.bz + 1 },
        ]
      : [
          { x: p.bx + 1, z: p.bz },
          { x: p.bx - 1, z: p.bz },
          { x: p.bx, z: p.bz + 1 },
          { x: p.bx, z: p.bz - 1 },
        ]

    for (const n of neighbors) {
      if (walkwaySet.has(`${n.x},${n.z}`)) continue
      if (!isFarEnough(n.x, n.z)) continue
      if (n.x < worldX || n.x >= worldX + CHUNK_SIZE) continue
      if (n.z < worldZ || n.z >= worldZ + CHUNK_SIZE) continue

      const baseY = p.by
      const torchY = baseY + WALKWAY_LANTERN_TORCH_Y_OFFSET
      if (torchY < 0 || torchY >= WORLD_HEIGHT) continue

      const lx = n.x - worldX
      const lz = n.z - worldZ

      const post1Key = localKey(lx, baseY + 1, lz)
      const post2Key = localKey(lx, baseY + 2, lz)
      const torchKey = localKey(lx, torchY, lz)
      if (!isAirOrCarved(voxelMap[post1Key])) continue
      if (!isAirOrCarved(voxelMap[post2Key])) continue
      if (!isAirOrCarved(voxelMap[torchKey])) continue

      const postId = getPostIdFor(n.x, n.z)
      voxelMap[post1Key] = postId
      voxelMap[post2Key] = postId
      voxelMap[torchKey] = torchId
      placed.push({ x: n.x, z: n.z })
      break
    }
  }

  // Fallback: in rare cases all adjacent candidates can be blocked (e.g. dense structures in small chunks).
  // Guarantee at least one lantern for any non-empty walkway cluster when there is vertical space.
  if (placed.length === 0) {
    for (const p of pathBlocks) {
      const lx = p.bx - worldX
      const lz = p.bz - worldZ
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue
      const baseY = p.by
      const torchY = baseY + WALKWAY_LANTERN_TORCH_Y_OFFSET
      if (torchY < 0 || torchY >= WORLD_HEIGHT) continue
      const post1Key = localKey(lx, baseY + 1, lz)
      const post2Key = localKey(lx, baseY + 2, lz)
      const torchKey = localKey(lx, torchY, lz)
      if (!isAirOrCarved(voxelMap[post1Key])) continue
      if (!isAirOrCarved(voxelMap[post2Key])) continue
      if (!isAirOrCarved(voxelMap[torchKey])) continue
      const postId = getPostIdFor(p.bx, p.bz)
      voxelMap[post1Key] = postId
      voxelMap[post2Key] = postId
      voxelMap[torchKey] = torchId
      placed.push({ x: p.bx, z: p.bz })
      break
    }
  }
}

/**
 * Collects village door positions with house bounds from the given structure origins.
 */
function getVillageDoorsFromOrigins(
  origins: StructureOrigin[],
  seed: number,
): VillageDoorPosition[] {
  const doors: VillageDoorPosition[] = []
  for (const o of origins) {
    if (o.type !== 'village') continue
    const houseSize = o.houseSize ?? getVillageHouseSizeFromSeed(seed, o.ox, o.oz)
    const { widthX, widthZ } = getHouseDimensions(o.ox, o.oz, houseSize)
    const halfX = Math.floor((widthX - 1) / 2)
    const halfZ = Math.floor((widthZ - 1) / 2)
    const minX = o.ox - halfX
    const minZ = o.oz - halfZ
    const maxX = minX + widthX - 1
    const maxZ = minZ + widthZ - 1
    const { doorX, doorZ } = getDoorPosition(o.ox, o.oz, houseSize)
    doors.push({
      doorX,
      doorZ,
      oy: o.oy,
      minX,
      maxX,
      minZ,
      maxZ,
    })
  }
  return doors
}

/**
 * Groups door positions into clusters by proximity (union-find).
 */
function clusterDoorsByProximity(doors: VillageDoorPosition[]): VillageDoorPosition[][] {
  const n = doors.length
  const parent = new Array(n).fill(0).map((_, i) => i)
  function find(i: number): number {
    if (parent[i] !== i) parent[i] = find(parent[i])
    return parent[i]
  }
  function union(i: number, j: number): void {
    parent[find(i)] = find(j)
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = doors[i].doorX - doors[j].doorX
      const dz = doors[i].doorZ - doors[j].doorZ
      if (dx * dx + dz * dz <= CLUSTER_RADIUS_SQ) union(i, j)
    }
  }
  const byRoot = new Map<number, VillageDoorPosition[]>()
  for (let i = 0; i < n; i++) {
    const r = find(i)
    if (!byRoot.has(r)) byRoot.set(r, [])
    byRoot.get(r)!.push(doors[i])
  }
  return [...byRoot.values()]
}

export interface PaintStructuresDeps {
  seed: number
  getHeight: (x: number, z: number) => number
  getResolvedBiome: (x: number, z: number) => import('../../types').Biome
  pois?: WorldPoi[]
}

/**
 * Paints structure blocks and village walkways into ctx.voxelMap using ctx.structureOrigins.
 * For walkways, gathers origins from 3x3 chunks around this chunk.
 */
export function paintStructures(ctx: ChunkContext, deps: PaintStructuresDeps): void {
  const { chunkX, chunkZ, worldX, worldZ, voxelMap } = ctx
  const { seed, getHeight, getResolvedBiome, pois } = deps
  const origins = ctx.structureOrigins ?? []
  const gravelId = typeToId('gravel')
  const pathId = typeToId('grass_path')

  for (const origin of origins) {
    const isVillage = origin.type === 'village'
    const houseSize = isVillage
      ? origin.houseSize ?? getVillageHouseSizeFromSeed(seed, origin.ox, origin.oz)
      : null
    const blocks =
      isVillage
        ? getVillageBlocks(
            origin.ox,
            origin.oy,
            origin.oz,
            houseSize!,
          )
        : getTempleBlocks(
            origin.ox - Math.floor(TEMPLE_SIZE / 2),
            origin.oy,
            origin.oz - Math.floor(TEMPLE_SIZE / 2),
          )

    for (const { bx, by, bz, block } of blocks) {
      if (by < 0 || by >= WORLD_HEIGHT) continue
      if (bx < worldX || bx >= worldX + CHUNK_SIZE) continue
      if (bz < worldZ || bz >= worldZ + CHUNK_SIZE) continue
      const lx = bx - worldX
      const lz = bz - worldZ
      voxelMap[localKey(lx, by, lz)] = typeToId(block)
    }

    if (isVillage && houseSize) {
      paintGuaranteedDoorTorch(ctx, deps, origin, houseSize)
    }
  }

  // Village plazas: use only local chunk origins so the center does not drift due to neighbor chunks.
  const localDoors = getVillageDoorsFromOrigins(origins, seed)
  const plazaClusters = clusterDoorsByProximity(localDoors)
  for (const cluster of plazaClusters) {
    if (cluster.length < 2) continue
    const centerX = cluster.reduce((s, d) => s + d.doorX, 0) / cluster.length
    const centerZ = cluster.reduce((s, d) => s + d.doorZ, 0) / cluster.length
    paintVillagePlaza(ctx, deps, centerX, centerZ, cluster)
  }

  // Gravel walkways: gather origins from 3x3 chunks.
  const allOrigins: StructureOrigin[] = [...origins]
  for (let dcx = -1; dcx <= 1; dcx++) {
    for (let dcz = -1; dcz <= 1; dcz++) {
      const proc = getStructureOriginsInChunk(
        seed,
        chunkX + dcx,
        chunkZ + dcz,
        getHeight,
        getResolvedBiome,
      )
      const fix =
        pois?.length
          ? getFixedVillageOriginsInChunk(
              pois,
              chunkX + dcx,
              chunkZ + dcz,
              getHeight,
              getResolvedBiome,
            )
          : []
      allOrigins.push(...proc, ...fix)
    }
  }
  const allDoorsRaw = getVillageDoorsFromOrigins(allOrigins, seed)
  const seen = new Set<string>()
  const allDoors = allDoorsRaw.filter((d) => {
    const key = `${d.doorX},${d.doorZ}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const clusters = clusterDoorsByProximity(allDoors)
  for (const cluster of clusters) {
    if (cluster.length < 2) continue
    const centerX = cluster.reduce((s, d) => s + d.doorX, 0) / cluster.length
    const centerZ = cluster.reduce((s, d) => s + d.doorZ, 0) / cluster.length

    const walkwayBlocks = getVillageWalkwayBlocks(
      cluster,
      centerX,
      centerZ,
      worldX,
      worldZ,
      CHUNK_SIZE,
    )
    for (const { bx, by, bz, block } of walkwayBlocks) {
      if (by < 0 || by >= WORLD_HEIGHT) continue
      if (bx < worldX || bx >= worldX + CHUNK_SIZE) continue
      if (bz < worldZ || bz >= worldZ + CHUNK_SIZE) continue
      const lx = bx - worldX
      const lz = bz - worldZ
      const key = localKey(lx, by, lz)
      const existing = voxelMap[key]
      // Do not overwrite already-painted structures/plaza elements (e.g. well water/stone).
      // Allow repainting over air/carved or existing path/gravel.
      if (!isAirOrCarved(existing) && existing !== gravelId && existing !== pathId) continue
      voxelMap[key] = typeToId(block)
    }

    paintVillageWalkwayLanterns(ctx, seed, walkwayBlocks)
  }
}

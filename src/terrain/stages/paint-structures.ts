/**
 * Paints structure templates (village, temple) and village walkways into chunk voxelMap.
 * Used by the features stage (stage 8); reads ctx.structureOrigins set by structures_starts.
 */
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../constants'
import type { WorldPoi } from '../../world-pois'
import { getFixedVillageOriginsInChunk } from '../../world-pois'
import { localKey, typeToId } from '../block-ids'
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

  for (const origin of origins) {
    const blocks =
      origin.type === 'village'
        ? getVillageBlocks(
            origin.ox,
            origin.oy,
            origin.oz,
            origin.houseSize ?? getVillageHouseSizeFromSeed(seed, origin.ox, origin.oz),
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
  }

  // Gravel walkways: gather origins from 3x3 chunks.
  const allOrigins: StructureOrigin[] = []
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
      voxelMap[localKey(lx, by, lz)] = typeToId(block)
    }
  }
}

/**
 * Deterministic structure origin placement. Grid-based candidates, biome and flatness checks.
 * Each origin places a single piece (max depth 1; no jigsaw expansion). Terminator = one piece per origin.
 */
import type { Biome } from '../../types'
import { CHUNK_SIZE } from '../../constants'

const STRUCTURE_GRID_STEP = 128
const STRUCTURE_RADIUS = 24
const FLATNESS_CHECK_RADIUS = 2
const MAX_HEIGHT_DEVIATION = 2
const STRUCTURE_PLACE_CHANCE = 0.28

export type StructureType = 'village' | 'temple'

/** Village house size; used for fixed POIs or derived from seed for procedural villages. */
export type VillageHouseSize = 'small' | 'medium' | 'large'

/**
 * One structure placement: either a village house (single building) or a temple.
 * For fixed POIs, villages are areas (center + radius); each house in that area gets one StructureOrigin here.
 */
export interface StructureOrigin {
  ox: number
  oz: number
  oy: number
  type: StructureType
  /** When true, spawn logic must not spawn villagers for this origin (used by fixed POI villages). */
  noAutoVillagers?: boolean
  /** Village house size; only used when type is 'village'. If unset, stage5 derives from seed. */
  houseSize?: VillageHouseSize
}

function hash(seed: number, ix: number, iz: number): number {
  let h = seed + ix * 374761393 + iz * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  h ^= h >> 16
  return (h >>> 0) / 0xffffffff
}

function isFlatEnough(
  getHeight: (x: number, z: number) => number,
  ox: number,
  oz: number,
): boolean {
  const centerY = getHeight(ox, oz)
  for (let dx = -FLATNESS_CHECK_RADIUS; dx <= FLATNESS_CHECK_RADIUS; dx++) {
    for (let dz = -FLATNESS_CHECK_RADIUS; dz <= FLATNESS_CHECK_RADIUS; dz++) {
      const y = getHeight(ox + dx, oz + dz)
      if (Math.abs(y - centerY) > MAX_HEIGHT_DEVIATION) return false
    }
  }
  return true
}

function villageBiome(biome: Biome): boolean {
  return (
    biome === 'plains' ||
    biome === 'meadow' ||
    biome === 'forest' ||
    biome === 'savanna' ||
    biome === 'cherry_grove'
  )
}

function templeBiome(biome: Biome): boolean {
  return biome === 'desert'
}

/**
 * Returns structure origins that overlap the given chunk. Deterministic from seed.
 */
export function getStructureOriginsInChunk(
  seed: number,
  chunkX: number,
  chunkZ: number,
  getHeight: (x: number, z: number) => number,
  getResolvedBiome: (x: number, z: number) => Biome,
): StructureOrigin[] {
  const worldX = chunkX * CHUNK_SIZE
  const worldZ = chunkZ * CHUNK_SIZE
  const minIx = Math.floor(
    (worldX - STRUCTURE_RADIUS - STRUCTURE_GRID_STEP / 2) / STRUCTURE_GRID_STEP,
  )
  const maxIx = Math.ceil(
    (worldX + CHUNK_SIZE + STRUCTURE_RADIUS - STRUCTURE_GRID_STEP / 2) / STRUCTURE_GRID_STEP,
  )
  const minIz = Math.floor(
    (worldZ - STRUCTURE_RADIUS - STRUCTURE_GRID_STEP / 2) / STRUCTURE_GRID_STEP,
  )
  const maxIz = Math.ceil(
    (worldZ + CHUNK_SIZE + STRUCTURE_RADIUS - STRUCTURE_GRID_STEP / 2) / STRUCTURE_GRID_STEP,
  )

  const out: StructureOrigin[] = []

  for (let ix = minIx; ix < maxIx; ix++) {
    for (let iz = minIz; iz < maxIz; iz++) {
      const ox = ix * STRUCTURE_GRID_STEP + STRUCTURE_GRID_STEP / 2
      const oz = iz * STRUCTURE_GRID_STEP + STRUCTURE_GRID_STEP / 2

      if (ox + STRUCTURE_RADIUS < worldX || ox - STRUCTURE_RADIUS >= worldX + CHUNK_SIZE) continue
      if (oz + STRUCTURE_RADIUS < worldZ || oz - STRUCTURE_RADIUS >= worldZ + CHUNK_SIZE) continue

      const roll = hash(seed + 9000, ix, iz)
      if (roll >= STRUCTURE_PLACE_CHANCE) continue

      const biome = getResolvedBiome(ox, oz)
      const typeRoll = hash(seed + 9001, ix, iz)
      let type: StructureType | null = null
      if (templeBiome(biome)) type = 'temple'
      else if (villageBiome(biome)) type = typeRoll < 0.5 ? 'village' : null
      if (!type) continue

      if (!isFlatEnough(getHeight, ox, oz)) continue

      const oy = Math.floor(getHeight(ox, oz))
      out.push({ ox, oz, oy, type })
    }
  }

  return out
}

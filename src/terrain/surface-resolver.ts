/**
 * Single source of truth for resolving the surface block for a column.
 * Pure logic: given topY, biome, blend, and optional precomputed slope/noise/neighbor data,
 * returns the correct surface block. Used by the chunk worker (terrain/index.ts) and
 * main-thread game-terrain.ts so both stay in sync without duplicating logic.
 */
import type { Biome, BlockType } from '../types'
import { WATER_LEVEL } from '../constants'
import { BIOME_REGISTRY } from './biomes'
import { BADLANDS_BAND_BLOCK_COUNT } from './surface-constants'
import { getSurfaceBlockFromRules } from './surface-rules'

/** Badlands band block types (Minecraft-style bands). Order defines which noise bucket maps to which block. */
export const BADLANDS_BAND_BLOCKS: BlockType[] = [
  'red_sand',
  'sandstone',
  'orange_terracotta',
  'yellow_terracotta',
  'red_terracotta',
  'white_terracotta',
]

/**
 * Returns the badlands band block for a noise value in [0, 1]. Shared by surface and subsurface banding.
 */
export function getBadlandsBlockFromNoise(noise: number): BlockType {
  const bandIndex = Math.min(
    BADLANDS_BAND_BLOCK_COUNT - 1,
    Math.floor(noise * BADLANDS_BAND_BLOCK_COUNT),
  )
  return BADLANDS_BAND_BLOCKS[bandIndex]
}

/** Biome blend at a column: primary/secondary biomes and blend weight t in [0,1]. */
export interface SurfaceBlend {
  primary: Biome
  secondary: Biome
  t: number
}

/** Inputs for resolving the surface block. Callers compute these from world position and height/biome queries. */
export interface SurfaceResolverParams {
  topY: number
  biome: Biome
  blend: SurfaceBlend
  /** Max cardinal height delta (slope) for cliff detection. */
  slope: number
  /** Noise [0..1] for frozen_peaks variation. */
  frozenPeaksNoiseN: number
  /** Noise [0..1] for frozen_peaks ice blobs. */
  frozenPeaksNoiseBlob: number
  /** True when column has a snow biome in 3x3 neighbor and surface would be grass. */
  hasSnowNeighbor: boolean
  /**
   * Dither noise [0..1] for coast blend (sand vs land). Omit or pass 0.5 for simplified/deterministic.
   */
  ditherNoiseCoast?: number
  /**
   * Dither noise [0..1] for land boundary blend. Omit or pass 0.5 for simplified/deterministic.
   */
  ditherNoiseLand?: number
  /**
   * Badlands banding: noise [0..1] at (x, z, topY). Discretized into bands (red_sand, sandstone, terracotta colors).
   * Omit for non-badlands or simplified path.
   */
  badlandsBandNoise?: number
}

/**
 * Returns the surface block for a column from precomputed inputs.
 * Order: underwater → shore → coast blend → land boundary dither → surface rules.
 *
 * @param params - Top Y, biome, blend, slope, frozen_peaks noise, snow neighbor, optional dither noises
 * @returns The block type to place at the surface of the column
 */
export function resolveSurfaceBlock(params: SurfaceResolverParams): BlockType {
  const {
    topY,
    biome,
    blend,
    slope,
    frozenPeaksNoiseN,
    frozenPeaksNoiseBlob,
    hasSnowNeighbor,
    ditherNoiseCoast = 0.5,
    ditherNoiseLand = 0.5,
    badlandsBandNoise,
  } = params

  const def = BIOME_REGISTRY[biome]
  let surface = def.blocks.surface as BlockType

  if (topY < WATER_LEVEL) return def.blocks.underwater as BlockType
  if (topY >= WATER_LEVEL - 1 && topY <= WATER_LEVEL + 1) return def.blocks.shore as BlockType

  // Coastline: blend sand <-> land surface inside the coastal band.
  if (blend.primary === 'ocean' && blend.secondary !== 'ocean') {
    const landSurface = BIOME_REGISTRY[blend.secondary].blocks.surface as BlockType
    return ditherNoiseCoast < blend.t ? landSurface : 'sand'
  }

  // Land biome boundary: probabilistic surface swap based on blend weight.
  // Minecraft-style: no dithering when desert is involved — sharp sand/grass boundary.
  if (
    blend.primary !== blend.secondary &&
    blend.primary !== 'ocean' &&
    blend.secondary !== 'ocean' &&
    blend.primary !== 'desert' &&
    blend.secondary !== 'desert'
  ) {
    const a = BIOME_REGISTRY[blend.primary].blocks.surface as BlockType
    const b = BIOME_REGISTRY[blend.secondary].blocks.surface as BlockType
    if (a !== b && blend.t > 0.1 && blend.t < 0.9) {
      return ditherNoiseLand < blend.t ? b : a
    }
  }

  // Badlands banding (Minecraft-style): noise-based bands (red_sand, sandstone, terracotta).
  if (biome === 'badlands' && badlandsBandNoise !== undefined) {
    surface = getBadlandsBlockFromNoise(badlandsBandNoise)
  }

  return getSurfaceBlockFromRules(biome, topY, surface, {
    slope,
    frozenPeaksNoiseN,
    frozenPeaksNoiseBlob,
    hasSnowNeighbor,
  })
}

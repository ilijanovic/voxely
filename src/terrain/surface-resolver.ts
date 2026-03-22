import type { Biome, BlockType } from '../types'
import { WATER_LEVEL } from '../constants'
import { BIOME_LAYERS } from './biomes'
import {
  BEACH_GRAVEL_PATCH_NOISE_MAX,
  BEACH_GRAVEL_PATCH_SLOPE_MIN,
  LAND_BLEND_DITHER_DESERT_MAX_T,
  LAND_BLEND_DITHER_DESERT_MIN_T,
  LAND_BLEND_DITHER_MAX_T,
  LAND_BLEND_DITHER_MIN_T,
  OLD_GROWTH_TAIGA_COARSE_DIRT_NOISE_MAX,
  OLD_GROWTH_TAIGA_GRASS_NOISE_MAX,
  RIVER_BANK_BLEND_MAX_HEIGHT,
  RIVER_BANK_GRAVEL_SLOPE_MIN,
  RIVER_BANK_NEAR_WATER_GRAVEL_NOISE_MAX,
  RIVER_BANK_SAND_MAX_HEIGHT,
  RIVER_BANK_UPPER_GRAVEL_NOISE_MAX,
  RIVER_BANK_UPPER_SAND_NOISE_MAX,
  SNOWY_BEACH_GRAVEL_NOISE_MAX,
  STONY_SHORE_STONE_NOISE_MIN,
} from './surface-constants'
import { getSurfaceBlockFromRules } from './surface-rules'
import { clamp01 } from './height-shaping'

/**
 * Ordered list of badlands terracotta band blocks used for mesa striping.
 * Also exported for features (e.g. desert-decor) to detect band surfaces.
 */
export const BADLANDS_BAND_BLOCKS: readonly BlockType[] = [
  'terracotta',
  'orange_terracotta',
  'yellow_terracotta',
  'red_terracotta',
  'brown_terracotta',
  'white_terracotta',
] as const

/**
 * Resolves a terracotta band block from a noise value.
 *
 * @param noise01 - Noise in [0,1]
 * @returns One of BADLANDS_BAND_BLOCKS
 */
export function getBadlandsBlockFromNoise(noise01: number): BlockType {
  const n = clamp01(noise01)
  const idx = Math.min(BADLANDS_BAND_BLOCKS.length - 1, Math.floor(n * BADLANDS_BAND_BLOCKS.length))
  return BADLANDS_BAND_BLOCKS[idx]
}

export interface ResolveSurfaceBlockArgs {
  topY: number
  biome: Biome
  /** Base biome blend at this column (ocean vs land). */
  blend: { primary: Biome; secondary: Biome; t: number }
  /** Max cardinal slope around column (blocks). */
  slope: number
  /** Coast dither noise in [0,1] */
  ditherNoiseCoast: number
  /** Land dither noise in [0,1] */
  ditherNoiseLand: number
  /** River bank noise in [0,1] used for sand patches along rivers. */
  riverBankNoise: number
  /** Optional badlands band noise in [0,1] used for terracotta striping. */
  badlandsBandNoise?: number
  /** frozen_peaks detail noise in [0,1] */
  frozenPeaksNoiseN: number
  /** frozen_peaks blob noise in [0,1] */
  frozenPeaksNoiseBlob: number
  /** Whether grass should turn into grass_snow because a snow biome is adjacent. */
  hasSnowNeighbor: boolean
}

/**
 * Returns true when the biome is one of the dedicated coastal edge biomes.
 *
 * @param biome - Biome id at this column
 * @returns Whether biome is beach/snowy_beach/stony_shore
 */
function isCoastalEdgeBiome(biome: Biome): boolean {
  return biome === 'beach' || biome === 'snowy_beach' || biome === 'stony_shore'
}

/**
 * Resolves a biome-specific coastal edge surface block with mild patchiness.
 *
 * @param biome - Current biome
 * @param slope - Max cardinal slope around this column
 * @param ditherNoiseLand - Land dither noise in [0,1]
 * @returns Surface block for dedicated coastal edge biomes
 */
function getCoastalEdgeSurfaceBlock(
  biome: Biome,
  slope: number,
  ditherNoiseLand: number,
): BlockType {
  if (biome === 'stony_shore') {
    return ditherNoiseLand >= STONY_SHORE_STONE_NOISE_MIN ? 'stone' : 'gravel'
  }
  if (biome === 'snowy_beach') {
    if (slope >= BEACH_GRAVEL_PATCH_SLOPE_MIN && ditherNoiseLand < SNOWY_BEACH_GRAVEL_NOISE_MAX)
      return 'gravel'
    return 'snow'
  }
  if (slope >= BEACH_GRAVEL_PATCH_SLOPE_MIN && ditherNoiseLand < BEACH_GRAVEL_PATCH_NOISE_MAX)
    return 'gravel'
  return 'sand'
}

/**
 * Resolves the effective surface block for a column.
 * This combines biome layer defaults with coast/river blending and the canonical surface rules.
 *
 * @param args - Surface context for this column
 * @returns Surface block type
 */
export function resolveSurfaceBlock(args: ResolveSurfaceBlockArgs): BlockType {
  const {
    topY,
    biome,
    blend,
    slope,
    ditherNoiseCoast,
    ditherNoiseLand,
    riverBankNoise,
    badlandsBandNoise,
    frozenPeaksNoiseN,
    frozenPeaksNoiseBlob,
    hasSnowNeighbor,
  } = args

  const blocks = BIOME_LAYERS[biome]

  // Start with the biome's own surface definition.
  let effectiveSurface: BlockType = blocks.surface

  // Badlands surface striping: terracotta bands on top, too.
  if (biome === 'badlands' && badlandsBandNoise != null) {
    effectiveSurface = getBadlandsBlockFromNoise(badlandsBandNoise)
  }

  // Old growth taiga: patchy podzol/coarse_dirt/grass mix for vanilla-like forest floor.
  if (biome === 'old_growth_taiga') {
    if (ditherNoiseLand < OLD_GROWTH_TAIGA_GRASS_NOISE_MAX) effectiveSurface = 'grass'
    else if (ditherNoiseLand < OLD_GROWTH_TAIGA_COARSE_DIRT_NOISE_MAX) effectiveSurface = 'coarse_dirt'
    else effectiveSurface = 'podzol'
  }

  // River banks: vanilla-like sand/gravel mix driven by height, slope, and noise.
  if (biome === 'river' && topY >= WATER_LEVEL - 1 && topY <= RIVER_BANK_BLEND_MAX_HEIGHT) {
    const isSteepBank = slope >= RIVER_BANK_GRAVEL_SLOPE_MIN
    if (topY <= RIVER_BANK_SAND_MAX_HEIGHT) {
      effectiveSurface =
        isSteepBank || riverBankNoise < RIVER_BANK_NEAR_WATER_GRAVEL_NOISE_MAX ? 'gravel' : 'sand'
    } else if (isSteepBank || riverBankNoise < RIVER_BANK_UPPER_GRAVEL_NOISE_MAX) {
      effectiveSurface = 'gravel'
    } else if (riverBankNoise < RIVER_BANK_UPPER_SAND_NOISE_MAX) {
      effectiveSurface = 'sand'
    }
  }

  if (isCoastalEdgeBiome(biome)) {
    effectiveSurface = getCoastalEdgeSurfaceBlock(biome, slope, ditherNoiseLand)
  }

  // Coast dither: transition sand/shore into land surface based on blend.t.
  // When primary is ocean and secondary is land, blend.t indicates "how land-like" the column is.
  if (blend.primary === 'ocean' && blend.secondary !== 'ocean') {
    const tLand = clamp01(blend.t)
    const landSurface = isCoastalEdgeBiome(biome) ? effectiveSurface : BIOME_LAYERS[blend.secondary].surface
    const oceanSurface = biome === 'stony_shore' ? 'gravel' : 'sand'
    // Use dither to avoid a perfectly smooth boundary.
    effectiveSurface = ditherNoiseCoast < tLand ? landSurface : oceanSurface
  }

  if (blend.primary !== 'ocean' && blend.secondary !== 'ocean') {
    const includesDesert = blend.primary === 'desert' || blend.secondary === 'desert'
    const minT = includesDesert ? LAND_BLEND_DITHER_DESERT_MIN_T : LAND_BLEND_DITHER_MIN_T
    const maxT = includesDesert ? LAND_BLEND_DITHER_DESERT_MAX_T : LAND_BLEND_DITHER_MAX_T
    if (blend.t >= minT && blend.t <= maxT) {
      const secondarySurface = BIOME_LAYERS[blend.secondary].surface
      effectiveSurface = ditherNoiseLand < blend.t ? secondarySurface : effectiveSurface
    }
  }

  // Land dither can introduce small sand speckles near coasts for variety.
  if (effectiveSurface === 'grass' && topY <= WATER_LEVEL + 2) {
    if (ditherNoiseLand < 0.06) effectiveSurface = 'sand'
  }

  // Apply canonical surface rules (stone/snow/ice/grass_snow, etc.).
  return getSurfaceBlockFromRules(biome, topY, effectiveSurface, {
    slope,
    frozenPeaksNoiseN,
    frozenPeaksNoiseBlob,
    hasSnowNeighbor,
  })
}


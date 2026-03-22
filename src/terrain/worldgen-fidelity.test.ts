/**
 * Fidelity-oriented worldgen regression tests.
 * These tests use a wider golden sample to keep terrain/biome/cave tuning measurable.
 */
import { describe, expect, it } from 'vitest'
import { CHUNK_SIZE, WATER_LEVEL, WORLD_HEIGHT, WORLD_MIN_Y } from '../constants'
import { createChunkGenerator } from './index'
import { ALL_BIOMES } from './index'
import { CARVED_ID, idToType, localKey } from './block-ids'

/** Golden seeds used for broad fidelity sampling. */
const GOLDEN_SEEDS = [12345, 99999, 202401] as const
/** Sample radius in chunks (1 => 3x3 chunk window). */
const SAMPLE_CHUNK_RADIUS = 1
/** Maximum expected step between neighboring boundary columns. */
const MAX_EDGE_STEP = 40
/** Maximum allowed cave-air ratio jump at chunk seams. */
const MAX_CAVE_SEAM_RATIO_DELTA = 0.3
/** Lower bound for river biome ratio in sampled chunks. */
const MIN_RIVER_RATIO = 0
/** Upper bound for river biome ratio in sampled chunks. */
const MAX_RIVER_RATIO = 0.45
/** Far coordinate chunks used for numerical stability checks. */
const FAR_COORD_CHUNKS: Array<[number, number]> = [
  [62500, 62500],
  [-62500, -62500],
  [62500, -62500],
] as const

interface WorldMetrics {
  minHeight: number
  maxHeight: number
  averageHeight: number
  waterColumnsRatio: number
  caveAirRatio: number
  biomeRichness: number
  riverColumnsRatio: number
}

/**
 * Computes underground air ratio up to a world Y limit.
 */
function getUndergroundAirRatio(payload: ReturnType<ReturnType<typeof createChunkPayloadGenerator>>, maxWorldY: number): number {
  let cells = 0
  let airCells = 0
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const topY = payload.heightmap[lx][lz]
      const yLimit = Math.min(topY, maxWorldY)
      for (let worldY = WORLD_MIN_Y; worldY <= yLimit; worldY++) {
        const ly = worldY - WORLD_MIN_Y
        const id = payload.buffer[localKey(lx, ly, lz)]
        cells++
        if (id === 0 || id === CARVED_ID) airCells++
      }
    }
  }
  return cells > 0 ? airCells / cells : 0
}

/**
 * Counts water_source blocks below a given world Y threshold.
 */
function countDeepWaterSourceBlocks(
  payload: ReturnType<ReturnType<typeof createChunkPayloadGenerator>>,
  maxWorldYExclusive: number,
): number {
  let count = 0
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let worldY = WORLD_MIN_Y; worldY < maxWorldYExclusive; worldY++) {
        const ly = worldY - WORLD_MIN_Y
        const id = payload.buffer[localKey(lx, ly, lz)]
        if (idToType(id) === 'water_source') count++
      }
    }
  }
  return count
}

/**
 * Creates a chunk payload generator for one seed.
 */
function createChunkPayloadGenerator(seed: number) {
  const generator = createChunkGenerator(seed)
  return (chunkX: number, chunkZ: number) => generator.generateChunkData(chunkX, chunkZ, [])
}

/**
 * FNV-1a 32-bit hash for deterministic fingerprints.
 */
function fnv1a32(bytes: Uint8Array): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Returns all chunk coordinates in a square window around origin.
 */
function getSampleChunks(radius: number): Array<[number, number]> {
  const chunks: Array<[number, number]> = []
  for (let cx = -radius; cx <= radius; cx++) {
    for (let cz = -radius; cz <= radius; cz++) {
      chunks.push([cx, cz])
    }
  }
  return chunks
}

/**
 * Collects terrain and cave metrics for one seed.
 */
function collectMetrics(seed: number): WorldMetrics {
  const generateChunk = createChunkPayloadGenerator(seed)
  const chunks = getSampleChunks(SAMPLE_CHUNK_RADIUS)
  let minHeight = Infinity
  let maxHeight = -Infinity
  let heightSum = 0
  let columnCount = 0
  let waterColumns = 0
  let caveAirCells = 0
  let undergroundCells = 0
  let riverColumns = 0
  const biomes = new Set<string>()
  const riverBiomeIndex = ALL_BIOMES.indexOf('river')
  const frozenRiverBiomeIndex = ALL_BIOMES.indexOf('frozen_river')

  for (const [cx, cz] of chunks) {
    const payload = generateChunk(cx, cz)
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = payload.heightmap[lx][lz]
        minHeight = Math.min(minHeight, topY)
        maxHeight = Math.max(maxHeight, topY)
        heightSum += topY
        columnCount++
        if (topY <= WATER_LEVEL) waterColumns++
      }
    }
    if (payload.biomeMapBuffer != null) {
      for (let i = 0; i < payload.biomeMapBuffer.length; i++) {
        const biomeIndex = payload.biomeMapBuffer[i]
        biomes.add(ALL_BIOMES[biomeIndex] ?? `unknown_${biomeIndex}`)
        if (biomeIndex === riverBiomeIndex || biomeIndex === frozenRiverBiomeIndex) riverColumns++
      }
    }
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = payload.heightmap[lx][lz]
        const yLimit = Math.min(topY, WATER_LEVEL + 16)
        for (let worldY = WORLD_MIN_Y; worldY <= yLimit; worldY++) {
          const ly = worldY - WORLD_MIN_Y
          const id = payload.buffer[localKey(lx, ly, lz)]
          undergroundCells++
          if (id === 0 || id === CARVED_ID) caveAirCells++
        }
      }
    }
  }

  return {
    minHeight: Number.isFinite(minHeight) ? minHeight : 0,
    maxHeight: Number.isFinite(maxHeight) ? maxHeight : 0,
    averageHeight: columnCount > 0 ? heightSum / columnCount : 0,
    waterColumnsRatio: columnCount > 0 ? waterColumns / columnCount : 0,
    caveAirRatio: undergroundCells > 0 ? caveAirCells / undergroundCells : 0,
    biomeRichness: biomes.size,
    riverColumnsRatio: columnCount > 0 ? riverColumns / columnCount : 0,
  }
}

/**
 * Creates a compact deterministic fingerprint for far-coordinate chunks.
 */
function farCoordinateFingerprint(seed: number): string[] {
  const generateChunk = createChunkPayloadGenerator(seed)
  return FAR_COORD_CHUNKS.map(([cx, cz]) => {
    const payload = generateChunk(cx, cz)
    return `${cx},${cz}:${fnv1a32(payload.buffer)}`
  })
}

/**
 * Returns the cave-air ratio for a vertical seam between two neighboring chunks.
 */
function getVerticalSeamCaveAirRatio(options: {
  leftBuffer: Uint8Array
  rightBuffer: Uint8Array
  seamZ: number
}): number {
  const { leftBuffer, rightBuffer, seamZ } = options
  let seamCells = 0
  let seamAirCells = 0
  for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
    const leftId = leftBuffer[localKey(CHUNK_SIZE - 1, ly, seamZ)]
    const rightId = rightBuffer[localKey(0, ly, seamZ)]
    seamCells += 2
    if (leftId === 0 || leftId === CARVED_ID) seamAirCells++
    if (rightId === 0 || rightId === CARVED_ID) seamAirCells++
  }
  return seamCells > 0 ? seamAirCells / seamCells : 0
}

describe('worldgen fidelity metrics', () => {
  it('collects deterministic metrics for golden seeds', () => {
    for (const seed of [GOLDEN_SEEDS[0], GOLDEN_SEEDS[1]]) {
      const first = collectMetrics(seed)
      const second = collectMetrics(seed)
      expect(second).toEqual(first)
    }
  })

  it('keeps golden-seed metrics within expected vanilla-like bounds', () => {
    for (const seed of GOLDEN_SEEDS) {
      const metrics = collectMetrics(seed)
      expect(metrics.minHeight).toBeGreaterThanOrEqual(-64)
      expect(metrics.maxHeight).toBeLessThanOrEqual(319)
      expect(metrics.averageHeight).toBeGreaterThan(50)
      expect(metrics.averageHeight).toBeLessThan(120)
      expect(metrics.waterColumnsRatio).toBeGreaterThanOrEqual(0)
      expect(metrics.waterColumnsRatio).toBeLessThan(0.75)
      expect(metrics.caveAirRatio).toBeGreaterThan(0.02)
      expect(metrics.caveAirRatio).toBeLessThan(0.65)
      expect(metrics.biomeRichness).toBeGreaterThanOrEqual(1)
      expect(metrics.riverColumnsRatio).toBeGreaterThanOrEqual(MIN_RIVER_RATIO)
      expect(metrics.riverColumnsRatio).toBeLessThan(MAX_RIVER_RATIO)
    }
  })
})

describe('worldgen seam and far-coordinate stability', () => {
  it('keeps chunk-edge height transitions bounded', () => {
    const seed = GOLDEN_SEEDS[0]
    const generateChunk = createChunkPayloadGenerator(seed)
    for (let cx = -SAMPLE_CHUNK_RADIUS; cx < SAMPLE_CHUNK_RADIUS; cx++) {
      for (let cz = -SAMPLE_CHUNK_RADIUS; cz <= SAMPLE_CHUNK_RADIUS; cz++) {
        const left = generateChunk(cx, cz)
        const right = generateChunk(cx + 1, cz)
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          const leftY = left.heightmap[CHUNK_SIZE - 1][lz]
          const rightY = right.heightmap[0][lz]
          expect(Math.abs(leftY - rightY)).toBeLessThanOrEqual(MAX_EDGE_STEP)
          const leftRightSeamRatio = getVerticalSeamCaveAirRatio({
            leftBuffer: left.buffer,
            rightBuffer: right.buffer,
            seamZ: lz,
          })
          const leftSeamRatio = getVerticalSeamCaveAirRatio({
            leftBuffer: left.buffer,
            rightBuffer: left.buffer,
            seamZ: lz,
          })
          expect(Math.abs(leftRightSeamRatio - leftSeamRatio)).toBeLessThanOrEqual(
            MAX_CAVE_SEAM_RATIO_DELTA,
          )
        }
      }
    }
  })

  it('is deterministic for very large chunk coordinates', () => {
    const seed = GOLDEN_SEEDS[1]
    const first = farCoordinateFingerprint(seed)
    const second = farCoordinateFingerprint(seed)
    expect(second).toEqual(first)
  })
})

describe('worldgen caves and aquifer behavior', () => {
  it('keeps custom worm/overhang carvers less aggressive by default', () => {
    const seed = GOLDEN_SEEDS[0]
    const chunkX = 0
    const chunkZ = 0
    const vanillaLike = createChunkGenerator(seed).generateChunkData(chunkX, chunkZ, [])
    const dramatic = createChunkGenerator(seed, {
      enableWormCarver: true,
      enableOverhangCarver: true,
    }).generateChunkData(chunkX, chunkZ, [])
    const baselineAir = getUndergroundAirRatio(vanillaLike, WATER_LEVEL + 24)
    const dramaticAir = getUndergroundAirRatio(dramatic, WATER_LEVEL + 24)
    expect(dramaticAir).toBeGreaterThanOrEqual(baselineAir)
  })

  it('creates deep water pockets for aquifer-like caves', () => {
    const seed = GOLDEN_SEEDS[1]
    const payload = createChunkGenerator(seed).generateChunkData(1, -1, [])
    const deepWaterCount = countDeepWaterSourceBlocks(payload, WATER_LEVEL - 3)
    expect(deepWaterCount).toBeGreaterThan(0)
  })
})

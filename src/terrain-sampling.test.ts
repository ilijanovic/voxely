import { describe, it, expect } from 'vitest'
import { createTerrainSampling } from './terrain-sampling'
import type { Biome } from './types'
import { createChunkGenerator } from './terrain-core'
import { WATER_LEVEL, WORLD_HEIGHT } from './constants'

const ALL_BIOMES: Biome[] = [
  'plains',
  'ocean',
  'river',
  'beach',
  'stony_shore',
  'desert',
  'savanna',
  'forest',
  'jungle',
  'mountain',
  'snow',
  'frozen_river',
  'snowy_beach',
  'meadow',
  'grove',
  'snowy_slopes',
  'stony_peaks',
  'frozen_peaks',
  'jagged_peaks',
  'cherry_grove',
  'windswept_hills',
  'windswept_gravelly_hills',
  'windswept_forest',
  'badlands',
  'mushroom_fields',
  'mangrove_swamp',
  'old_growth_taiga',
]

describe('createTerrainSampling().getBiomeBlend', () => {
  it('is deterministic for same seed and position', () => {
    const a = createTerrainSampling(123)
    const b = createTerrainSampling(123)
    const p1 = a.getBiomeBlend(100, -50)
    const p2 = b.getBiomeBlend(100, -50)
    expect(p1).toEqual(p2)
  })

  it('returns valid biomes and t in [0,1]', () => {
    const s = createTerrainSampling(1)
    for (let x = -200; x <= 200; x += 40) {
      for (let z = -200; z <= 200; z += 40) {
        const out = s.getBiomeBlend(x, z)
        expect(ALL_BIOMES).toContain(out.primary)
        expect(ALL_BIOMES).toContain(out.secondary)
        expect(out.t).toBeGreaterThanOrEqual(0)
        expect(out.t).toBeLessThanOrEqual(1)
      }
    }
  })

  it('finds at least one coastal blend (ocean->land) in a bounded scan', () => {
    const s = createTerrainSampling(7)
    let found = false
    for (let x = -800; x <= 800; x += 40) {
      for (let z = -800; z <= 800; z += 40) {
        const out = s.getBiomeBlend(x, z)
        if (out.primary === 'ocean' && out.secondary !== 'ocean') {
          expect(out.t).toBeGreaterThan(0)
          expect(out.t).toBeLessThan(1)
          found = true
          break
        }
      }
      if (found) break
    }
    expect(found).toBe(true)
  })
})

describe('createTerrainSampling().isShore', () => {
  const s = createTerrainSampling(42)

  it('returns true when topY is at water level', () => {
    expect(s.isShore(WATER_LEVEL)).toBe(true)
  })

  it('returns true for topY one above water level', () => {
    expect(s.isShore(WATER_LEVEL + 1)).toBe(true)
  })

  it('returns true for topY one below water level', () => {
    expect(s.isShore(WATER_LEVEL - 1)).toBe(true)
  })

  it('returns false for topY well above water level', () => {
    expect(s.isShore(70)).toBe(false)
  })

  it('returns false for topY well below water level', () => {
    expect(s.isShore(50)).toBe(false)
  })
})

describe('createTerrainSampling().getBlockTypeAt', () => {
  const s = createTerrainSampling(42)

  it('returns bedrock at y=0', () => {
    expect(s.getBlockTypeAt('plains', 0, 70)).toBe('bedrock')
  })

  it('returns stone deep underground', () => {
    expect(s.getBlockTypeAt('plains', 10, 70)).toBe('stone')
  })

  it('returns water above ocean floor and below water level', () => {
    expect(s.getBlockTypeAt('ocean', 55, 50)).toBe('water')
  })

  it('returns sand at shore surface', () => {
    expect(s.getBlockTypeAt('plains', WATER_LEVEL, WATER_LEVEL)).toBe('sand')
  })

  it('returns sand for underwater surface', () => {
    expect(s.getBlockTypeAt('ocean', 50, 50)).toBe('sand')
  })

  it('returns biome surface block at top for non-shore land', () => {
    const block = s.getBlockTypeAt('desert', 70, 70)
    expect(block).toBe('sand')
  })

  it('returns stone at high altitude surface', () => {
    const block = s.getBlockTypeAt('mountain', 92, 92)
    expect(block).toBe('stone')
  })
})

describe('createTerrainSampling().getResolvedBiome', () => {
  const s = createTerrainSampling(42)

  it('returns a valid biome for any position', () => {
    for (let x = -200; x <= 200; x += 50) {
      for (let z = -200; z <= 200; z += 50) {
        const biome = s.getResolvedBiome(x, z, s.getSmoothedHeight)
        expect(ALL_BIOMES).toContain(biome)
      }
    }
  })

  it('is deterministic for same seed and position', () => {
    const a = createTerrainSampling(999)
    const b = createTerrainSampling(999)
    for (let x = 0; x <= 100; x += 25) {
      for (let z = 0; z <= 100; z += 25) {
        expect(a.getResolvedBiome(x, z, a.getSmoothedHeight)).toBe(
          b.getResolvedBiome(x, z, b.getSmoothedHeight),
        )
      }
    }
  })

  it('finds snowy_beach on at least one cold coast sample', () => {
    const seeds = [42, 1337, 24680]
    const min = -2048
    const max = 2048
    const step = 24
    const coastHeight = () => WATER_LEVEL + 2
    let found = false

    for (const seed of seeds) {
      const sampling = createTerrainSampling(seed)
      for (let x = min; x <= max; x += step) {
        for (let z = min; z <= max; z += step) {
          if (sampling.getResolvedBiome(x, z, coastHeight) === 'snowy_beach') {
            found = true
            break
          }
        }
        if (found) break
      }
      if (found) break
    }

    expect(found).toBe(true)
  })

  it('resolves highland biomes for high elevations in mountain/snow base', () => {
    const highlandBiomes: Biome[] = [
      'meadow',
      'grove',
      'snowy_slopes',
      'stony_peaks',
      'frozen_peaks',
      'jagged_peaks',
      'cherry_grove',
      'windswept_hills',
      'windswept_gravelly_hills',
      'windswept_forest',
    ]
    const highGetHeight = () => 100
    let foundHighland = false
    for (let x = -500; x <= 500; x += 20) {
      for (let z = -500; z <= 500; z += 20) {
        const biome = s.getResolvedBiome(x, z, highGetHeight)
        if (highlandBiomes.includes(biome)) {
          foundHighland = true
          break
        }
      }
      if (foundHighland) break
    }
    expect(foundHighland).toBe(true)
  })

  it('keeps a snowy_slopes buffer between grove and jagged_peaks in sampled terrain', () => {
    const SEED = 42
    const MIN = -768
    const MAX = 768
    const STEP = 16
    const sampling = createTerrainSampling(SEED)
    const heightCache = new Map<string, number>()
    const biomeCache = new Map<string, Biome>()
    let groveCount = 0
    let jaggedCount = 0

    function key(x: number, z: number): string {
      return `${x},${z}`
    }

    function getHeightFloor(x: number, z: number): number {
      const k = key(x, z)
      const cached = heightCache.get(k)
      if (cached !== undefined) return cached
      const value = Math.floor(sampling.getSmoothedHeight(x, z))
      heightCache.set(k, value)
      return value
    }

    function getResolved(x: number, z: number): Biome {
      const k = key(x, z)
      const cached = biomeCache.get(k)
      if (cached !== undefined) return cached
      const value = sampling.getResolvedBiome(x, z, getHeightFloor)
      biomeCache.set(k, value)
      return value
    }

    for (let x = MIN; x <= MAX; x += STEP) {
      for (let z = MIN; z <= MAX; z += STEP) {
        const center = getResolved(x, z)
        if (center === 'grove') groveCount++
        if (center === 'jagged_peaks') jaggedCount++

        const right = getResolved(x + STEP, z)
        const down = getResolved(x, z + STEP)
        const rightIsForbiddenPair =
          (center === 'grove' && right === 'jagged_peaks') ||
          (center === 'jagged_peaks' && right === 'grove')
        const downIsForbiddenPair =
          (center === 'grove' && down === 'jagged_peaks') ||
          (center === 'jagged_peaks' && down === 'grove')

        expect(
          !rightIsForbiddenPair,
          `found grove/jagged direct adjacency at (${x}, ${z}) -> (${x + STEP}, ${z})`,
        ).toBe(true)
        expect(
          !downIsForbiddenPair,
          `found grove/jagged direct adjacency at (${x}, ${z}) -> (${x}, ${z + STEP})`,
        ).toBe(true)
      }
    }

    // Guard against false-positive pass from a scan that never hits either biome.
    expect(groveCount).toBeGreaterThan(0)
    expect(jaggedCount).toBeGreaterThan(0)
  })
})

describe('createTerrainSampling() height functions', () => {
  it('getRawTerrainHeight is deterministic for same seed', () => {
    const a = createTerrainSampling(77)
    const b = createTerrainSampling(77)
    expect(a.getRawTerrainHeight(50, 50)).toBe(b.getRawTerrainHeight(50, 50))
  })

  it('getSmoothedHeight is deterministic for same seed', () => {
    const a = createTerrainSampling(77)
    const b = createTerrainSampling(77)
    expect(a.getSmoothedHeight(50, 50)).toBe(b.getSmoothedHeight(50, 50))
  })

  it('getRawTerrainHeight produces different results for different seeds', () => {
    const a = createTerrainSampling(1)
    const b = createTerrainSampling(2)
    let different = false
    for (let x = 0; x < 100; x += 10) {
      if (a.getRawTerrainHeight(x, 0) !== b.getRawTerrainHeight(x, 0)) {
        different = true
        break
      }
    }
    expect(different).toBe(true)
  })

  it('height values are in a reasonable range', () => {
    const s = createTerrainSampling(42)
    for (let x = -100; x <= 100; x += 20) {
      for (let z = -100; z <= 100; z += 20) {
        const h = s.getRawTerrainHeight(x, z)
        expect(h).toBeGreaterThan(0)
        expect(h).toBeLessThan(200)
      }
    }
  })
})

/**
 * Worker vs main-thread contract: terrain pipeline (worker) and terrain-sampling (main/sync)
 * must produce the same height for the same seed and (x,z). Sync fallback uses
 * getHeight from game-terrain which uses terrain-sampling.getSmoothedHeight.
 */
describe('pipeline vs terrain-sampling height parity (worker/sync contract)', () => {
  const SEED = 4242

  function samplingHeightAt(x: number, z: number): number {
    const s = createTerrainSampling(SEED)
    const h = s.getSmoothedHeight(x, z)
    return Math.floor(Math.max(0, Math.min(WORLD_HEIGHT, h)))
  }

  it('pipeline getHeight matches terrain-sampling (clamped) for same seed', () => {
    const gen = createChunkGenerator(SEED)
    const points: [number, number][] = []
    for (let x = -32; x <= 32; x += 8) {
      for (let z = -32; z <= 32; z += 8) {
        points.push([x, z])
      }
    }
    for (const [x, z] of points) {
      const pipelineH = gen.getHeight(x, z)
      const samplingH = samplingHeightAt(x, z)
      expect(
        pipelineH,
        `height at (${x}, ${z}): pipeline ${pipelineH} vs sampling ${samplingH}`,
      ).toBe(samplingH)
    }
  })
})

/**
 * Worker vs main-thread contract for biome resolution.
 * For the same seed and (x, z), the resolved biome from the pipeline generator and
 * from terrain-sampling should agree when using the same height function.
 */
describe('pipeline vs terrain-sampling biome parity', () => {
  const SEED = 4242

  it('getResolvedBiome matches terrain-sampling for typical positions', () => {
    const gen = createChunkGenerator(SEED)
    const sampling = createTerrainSampling(SEED)

    for (let x = -64; x <= 64; x += 16) {
      for (let z = -64; z <= 64; z += 16) {
        // Pipeline resolves biomes from integer column heights; mirror that here.
        const h = Math.floor(Math.max(0, Math.min(WORLD_HEIGHT, sampling.getSmoothedHeight(x, z))))
        const samplingBiome = sampling.getResolvedBiome(x, z, () => h)
        const pipelineBiome = gen.getResolvedBiome(x, z)
        expect(
          pipelineBiome,
          `biome at (${x}, ${z}): pipeline ${pipelineBiome} vs sampling ${samplingBiome}`,
        ).toBe(samplingBiome)
      }
    }
  })
})

describe('river generation', () => {
  const SEED = 7331

  it('produces river biome columns in a broad inland scan', () => {
    const gen = createChunkGenerator(SEED)
    let riverCount = 0

    for (let x = -1024; x <= 1024; x += 16) {
      for (let z = -1024; z <= 1024; z += 16) {
        if (gen.getResolvedBiome(x, z) === 'river') riverCount++
      }
    }

    expect(riverCount).toBeGreaterThan(40)
  })

  it('keeps river beds near sea level and often underwater', () => {
    const gen = createChunkGenerator(SEED)
    let riverCount = 0
    let underwaterRiverCount = 0
    let highestRiverY = -Infinity

    for (let x = -1024; x <= 1024; x += 16) {
      for (let z = -1024; z <= 1024; z += 16) {
        if (gen.getResolvedBiome(x, z) !== 'river') continue
        riverCount++
        const y = gen.getHeight(x, z)
        highestRiverY = Math.max(highestRiverY, y)
        if (y < WATER_LEVEL) underwaterRiverCount++
      }
    }

    expect(riverCount).toBeGreaterThan(0)
    expect(underwaterRiverCount).toBeGreaterThan(40)
    expect(underwaterRiverCount / riverCount).toBeGreaterThan(0.4)
    expect(highestRiverY).toBeLessThanOrEqual(WATER_LEVEL + 8)
  })
})

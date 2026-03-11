/**
 * Registry tests: every Biome must have terrain params and layer config.
 * When adding a new biome: add to Biome in types.ts, add biomes/<name>.ts, register here and in index.
 */
import { describe, it, expect } from 'vitest'
import type { Biome } from '../../types'
import { BIOME_TERRAIN, BIOME_LAYERS } from './index'
import { BIOME_REGISTRY, getBiomeByMultiNoise, getLandBiomeBlendByClimate } from './registry'

const ALL_BIOMES: Biome[] = [
  'plains',
  'ocean',
  'desert',
  'savanna',
  'forest',
  'jungle',
  'mountain',
  'snow',
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

const BASE_LAND_BIOMES: Biome[] = [
  'desert',
  'plains',
  'savanna',
  'forest',
  'jungle',
  'mountain',
  'snow',
  'badlands',
  'mushroom_fields',
  'mangrove_swamp',
  'old_growth_taiga',
]

function climateCenter(b: Biome): { temp: number; humidity: number } {
  const c = BIOME_REGISTRY[b].climate
  if (!c) throw new Error(`missing climate for ${b}`)
  return {
    temp: (c.tempMin + c.tempMax) / 2,
    humidity: (c.humidityMin + c.humidityMax) / 2,
  }
}

describe('BIOME_TERRAIN', () => {
  it('has an entry for every Biome', () => {
    for (const biome of ALL_BIOMES) {
      expect(BIOME_TERRAIN[biome], `missing BIOME_TERRAIN for ${biome}`).toBeDefined()
    }
  })

  it('has no extra keys beyond Biome', () => {
    const terrainKeys = Object.keys(BIOME_TERRAIN) as Biome[]
    expect(terrainKeys.sort()).toEqual([...ALL_BIOMES].sort())
  })

  it('each entry has required TerrainParams fields', () => {
    for (const biome of ALL_BIOMES) {
      const t = BIOME_TERRAIN[biome]
      expect(t, biome).toBeDefined()
      expect(typeof t.baseOffset).toBe('number')
      expect(typeof t.detailAmp).toBe('number')
      expect(typeof t.detailFreq).toBe('number')
      expect(typeof t.flatness).toBe('number')
      expect(typeof t.mountainAllowed).toBe('boolean')
    }
  })
})

describe('BIOME_LAYERS', () => {
  it('has an entry for every Biome', () => {
    for (const biome of ALL_BIOMES) {
      expect(BIOME_LAYERS[biome], `missing BIOME_LAYERS for ${biome}`).toBeDefined()
    }
  })

  it('has no extra keys beyond Biome', () => {
    const layerKeys = Object.keys(BIOME_LAYERS) as Biome[]
    expect(layerKeys.sort()).toEqual([...ALL_BIOMES].sort())
  })

  it('each entry has valid LayerConfig', () => {
    for (const biome of ALL_BIOMES) {
      const layers = BIOME_LAYERS[biome]
      expect(layers, biome).toBeDefined()
      expect(typeof layers.surface).toBe('string')
      expect(layers.surface.length).toBeGreaterThan(0)
      expect(typeof layers.subsurface).toBe('string')
      expect(layers.subsurface.length).toBeGreaterThan(0)
      expect(Number.isInteger(layers.subsurfaceDepth)).toBe(true)
      expect(layers.subsurfaceDepth).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('BIOME_REGISTRY', () => {
  it('has a definition for every Biome', () => {
    for (const biome of ALL_BIOMES) {
      expect(BIOME_REGISTRY[biome], `missing BIOME_REGISTRY entry for ${biome}`).toBeDefined()
    }
  })

  it('each entry has required blocks keys', () => {
    for (const biome of ALL_BIOMES) {
      const def = BIOME_REGISTRY[biome]
      expect(def, biome).toBeDefined()
      expect(def.blocks, biome).toBeDefined()
      expect(typeof def.blocks.surface).toBe('string')
      expect(def.blocks.surface.length).toBeGreaterThan(0)
      expect(typeof def.blocks.subsurface).toBe('string')
      expect(def.blocks.subsurface.length).toBeGreaterThan(0)
      expect(Number.isInteger(def.blocks.subsurfaceDepth)).toBe(true)
      expect(def.blocks.subsurfaceDepth).toBeGreaterThanOrEqual(0)
      expect(typeof def.blocks.shore).toBe('string')
      expect(def.blocks.shore.length).toBeGreaterThan(0)
      expect(typeof def.blocks.underwater).toBe('string')
      expect(def.blocks.underwater.length).toBeGreaterThan(0)
    }
  })

  it('all base land biomes define climate bounds', () => {
    for (const biome of BASE_LAND_BIOMES) {
      expect(BIOME_REGISTRY[biome].climate, `missing climate for ${biome}`).toBeDefined()
    }
  })
})

describe('getLandBiomeBlendByClimate', () => {
  it('returns t in [0,1] and land biomes', () => {
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        const temp = i / 10
        const humidity = j / 10
        const b = getLandBiomeBlendByClimate(temp, humidity)
        expect(b.t).toBeGreaterThanOrEqual(0)
        expect(b.t).toBeLessThanOrEqual(1)
        expect(BASE_LAND_BIOMES).toContain(b.primary)
        expect(BASE_LAND_BIOMES).toContain(b.secondary)
      }
    }
  })

  it('near a biome climate center, primary is that biome and t is small', () => {
    for (const biome of BASE_LAND_BIOMES) {
      const c = climateCenter(biome)
      const b = getLandBiomeBlendByClimate(c.temp, c.humidity)
      expect(b.primary).toBe(biome)
      expect(b.t).toBeGreaterThanOrEqual(0)
      expect(b.t).toBeLessThan(0.25)
    }
  })

  it('at the midpoint between two climate centers, blend is roughly 50/50 between them', () => {
    let found = false
    for (let i = 0; i < BASE_LAND_BIOMES.length; i++) {
      for (let j = i + 1; j < BASE_LAND_BIOMES.length; j++) {
        const a = BASE_LAND_BIOMES[i]
        const b = BASE_LAND_BIOMES[j]
        const ca = climateCenter(a)
        const cb = climateCenter(b)
        const midT = (ca.temp + cb.temp) / 2
        const midH = (ca.humidity + cb.humidity) / 2
        const out = getLandBiomeBlendByClimate(midT, midH)
        const outPair = [out.primary, out.secondary].sort()
        const targetPair = [a, b].sort()
        if (outPair[0] !== targetPair[0] || outPair[1] !== targetPair[1]) continue
        expect(out.t).toBeGreaterThan(0.35)
        expect(out.t).toBeLessThan(0.65)
        found = true
        break
      }
      if (found) break
    }
    expect(found).toBe(true)
  })
})

describe('getBiomeByMultiNoise', () => {
  it('returns only biomes that define multiNoise', () => {
    const r = getBiomeByMultiNoise({
      continentalness: 0.7,
      erosion: 0.1,
      temperature: 0.65,
      humidity: -0.65,
      weirdness: 0.0,
      y: 0.22,
    })
    expect(BIOME_REGISTRY[r].multiNoise, `selected biome ${r} has no multiNoise`).toBeDefined()
  })
})

import { describe, it, expect } from 'vitest'
import {
  isWaterBlock,
  getWaterLevel,
  waterLevelToBlockType,
  computeWaterSpread,
  type WaterSpreadOptions,
} from './water-flow'
import { WATER_MAX_LEVEL } from '../../constants'

describe('isWaterBlock', () => {
  it('returns true for water_source', () => {
    expect(isWaterBlock('water_source')).toBe(true)
  })

  it('returns true for water_flowing_1 through water_flowing_7', () => {
    for (let k = 1; k <= WATER_MAX_LEVEL; k++) {
      expect(isWaterBlock(`water_flowing_${k}` as import('../../types').BlockType)).toBe(true)
    }
  })

  it('returns false for air', () => {
    expect(isWaterBlock('air')).toBe(false)
  })

  it('returns false for solid blocks', () => {
    expect(isWaterBlock('stone')).toBe(false)
    expect(isWaterBlock('dirt')).toBe(false)
  })
})

describe('getWaterLevel', () => {
  it('returns 0 for water_source', () => {
    expect(getWaterLevel('water_source')).toBe(0)
  })

  it('returns 1..7 for water_flowing_1..7', () => {
    for (let k = 1; k <= WATER_MAX_LEVEL; k++) {
      expect(getWaterLevel(`water_flowing_${k}` as import('../../types').BlockType)).toBe(k)
    }
  })

  it('returns -1 for air and non-water', () => {
    expect(getWaterLevel('air')).toBe(-1)
    expect(getWaterLevel('stone')).toBe(-1)
  })
})

describe('waterLevelToBlockType', () => {
  it('returns water_source for level 0 or negative', () => {
    expect(waterLevelToBlockType(0)).toBe('water_source')
    expect(waterLevelToBlockType(-1)).toBe('water_source')
  })

  it('returns water_flowing_k for level 1..7', () => {
    for (let k = 1; k <= WATER_MAX_LEVEL; k++) {
      expect(waterLevelToBlockType(k)).toBe(`water_flowing_${k}`)
    }
  })

  it('caps level at WATER_MAX_LEVEL', () => {
    expect(waterLevelToBlockType(8)).toBe('water_flowing_7')
  })
})

describe('computeWaterSpread', () => {
  function makeOptions(overrides: Partial<WaterSpreadOptions> = {}): WaterSpreadOptions {
    const map = new Map<string, string>()
    return {
      getBlockAt: (bx, by, bz) => {
        const k = `${bx},${by},${bz}`
        return (map.get(k) ?? 'air') as import('../../types').BlockType | 'air'
      },
      isSolid: (t) => t !== 'air' && !t.startsWith('water_'),
      waterPositions: [],
      ...overrides,
    }
  }

  it('flows down into air below a source', () => {
    const map = new Map<string, string>()
    map.set('5,10,5', 'water_source')
    const opts = makeOptions({
      getBlockAt: (bx, by, bz) => (map.get(`${bx},${by},${bz}`) ?? 'air') as import('../../types').BlockType | 'air',
      waterPositions: [{ bx: 5, by: 10, bz: 5 }],
    })
    const changes = computeWaterSpread(opts)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual({ bx: 5, by: 9, bz: 5, value: 'water_flowing_1' })
  })

  it('flows horizontally when block below is solid', () => {
    const map = new Map<string, string>()
    map.set('5,10,5', 'water_source')
    map.set('5,9,5', 'stone') // solid below
    const opts = makeOptions({
      getBlockAt: (bx, by, bz) => (map.get(`${bx},${by},${bz}`) ?? 'air') as import('../../types').BlockType | 'air',
      isSolid: (t) => t === 'stone' || (t !== 'air' && !t.startsWith('water_')),
      waterPositions: [{ bx: 5, by: 10, bz: 5 }],
    })
    const changes = computeWaterSpread(opts)
    expect(changes.length).toBeGreaterThanOrEqual(1)
    const horizontal = changes.filter((c) => c.by === 10)
    expect(horizontal.some((c) => c.bx === 6 && c.bz === 5 && c.value === 'water_flowing_1')).toBe(true)
  })

  it('does not spread into solid blocks', () => {
    const map = new Map<string, string>()
    map.set('5,10,5', 'water_source')
    map.set('5,9,5', 'stone')
    map.set('6,10,5', 'stone') // block to the side
    const opts = makeOptions({
      getBlockAt: (bx, by, bz) => (map.get(`${bx},${by},${bz}`) ?? 'air') as import('../../types').BlockType | 'air',
      isSolid: (t) => t === 'stone' || (t !== 'air' && !t.startsWith('water_')),
      waterPositions: [{ bx: 5, by: 10, bz: 5 }],
    })
    const changes = computeWaterSpread(opts)
    expect(changes.some((c) => c.bx === 6 && c.by === 10 && c.bz === 5)).toBe(false)
  })

  it('stops horizontal spread at level 7', () => {
    const map = new Map<string, string>()
    map.set('5,9,5', 'stone')
    for (let x = 0; x <= 7; x++) map.set(`${x},10,5`, x === 0 ? 'water_source' : `water_flowing_${x}`)
    const opts = makeOptions({
      getBlockAt: (bx, by, bz) => (map.get(`${bx},${by},${bz}`) ?? 'air') as import('../../types').BlockType | 'air',
      isSolid: (t) => t === 'stone' || (t !== 'air' && !t.startsWith('water_')),
      waterPositions: [{ bx: 7, by: 10, bz: 5 }], // only process the level-7 block
    })
    const changes = computeWaterSpread(opts)
    // Level 7 can only spread to level 8 which is capped to 7; so no new block beyond 7
    const newAt8 = changes.find((c) => c.bx === 8 && c.by === 10 && c.bz === 5)
    expect(newAt8).toBeUndefined()
  })

  it('creates source when two sources adjacent and solid below', () => {
    const map = new Map<string, string>()
    map.set('5,10,5', 'water_source')
    map.set('6,10,6', 'water_source') // diagonal from (5,10,6)
    map.set('5,9,5', 'stone')
    map.set('6,9,6', 'stone')
    map.set('5,9,6', 'stone')
    map.set('6,9,5', 'stone')
    // Air at (5,10,6); horizontal neighbours (5,10,5) and (6,10,6) are both sources; (5,9,6) solid
    const opts = makeOptions({
      getBlockAt: (bx, by, bz) => (map.get(`${bx},${by},${bz}`) ?? 'air') as import('../../types').BlockType | 'air',
      isSolid: (t) => t === 'stone' || (t !== 'air' && !t.startsWith('water_')),
      waterPositions: [
        { bx: 5, by: 10, bz: 5 },
        { bx: 6, by: 10, bz: 6 },
      ],
    })
    const changes = computeWaterSpread(opts)
    // (5,10,6) gets water from (5,10,5); it has neighbours (5,10,5) and (6,10,6) = 2 sources, solid below → upgrade to source
    const at556 = changes.find((c) => c.bx === 5 && c.by === 10 && c.bz === 6)
    expect(at556).toBeDefined()
    expect(at556?.value).toBe('water_source')
  })

  it('does not spread into null (unloaded chunk)', () => {
    const map = new Map<string, string>()
    map.set('5,10,5', 'water_source')
    map.set('5,9,5', 'stone')
    let getBlockAtCalls = 0
    const opts = makeOptions({
      getBlockAt: (bx, by, bz) => {
        getBlockAtCalls++
        if (bx === 6 && by === 10 && bz === 5) return null // unloaded
        return (map.get(`${bx},${by},${bz}`) ?? 'air') as import('../../types').BlockType | 'air'
      },
      isSolid: (t) => t === 'stone' || (t !== 'air' && !t.startsWith('water_')),
      waterPositions: [{ bx: 5, by: 10, bz: 5 }],
    })
    const changes = computeWaterSpread(opts)
    expect(changes.some((c) => c.bx === 6 && c.by === 10 && c.bz === 5)).toBe(false)
  })

  it('recedes unsupported flowing water to air when no source feeds it', () => {
    const map = new Map<string, string>()
    map.set('5,10,5', 'water_flowing_3')
    map.set('5,9,5', 'stone')
    const opts = makeOptions({
      getBlockAt: (bx, by, bz) => (map.get(`${bx},${by},${bz}`) ?? 'air') as import('../../types').BlockType | 'air',
      isSolid: (t) => t === 'stone' || (t !== 'air' && !t.startsWith('water_')),
      waterPositions: [{ bx: 5, by: 10, bz: 5 }],
    })
    const changes = computeWaterSpread(opts)
    expect(changes).toContainEqual({ bx: 5, by: 10, bz: 5, value: 'air' })
  })

  it('resets falling flow to level 1 in deep waterfalls', () => {
    const map = new Map<string, string>()
    map.set('5,11,5', 'water_source')
    map.set('5,10,5', 'water_flowing_7')
    const opts = makeOptions({
      getBlockAt: (bx, by, bz) => (map.get(`${bx},${by},${bz}`) ?? 'air') as import('../../types').BlockType | 'air',
      waterPositions: [
        { bx: 5, by: 11, bz: 5 },
        { bx: 5, by: 10, bz: 5 },
      ],
    })
    const changes = computeWaterSpread(opts)
    expect(changes).toContainEqual({ bx: 5, by: 10, bz: 5, value: 'water_flowing_1' })
    expect(changes).toContainEqual({ bx: 5, by: 9, bz: 5, value: 'water_flowing_1' })
  })

  it('upgrades existing flowing_1 to source when two adjacent sources and solid below', () => {
    const map = new Map<string, string>()
    map.set('5,10,5', 'water_source')
    map.set('7,10,5', 'water_source')
    map.set('6,10,5', 'water_flowing_1')
    map.set('5,9,5', 'stone')
    map.set('6,9,5', 'stone')
    map.set('7,9,5', 'stone')
    const opts = makeOptions({
      getBlockAt: (bx, by, bz) => (map.get(`${bx},${by},${bz}`) ?? 'air') as import('../../types').BlockType | 'air',
      isSolid: (t) => t === 'stone' || (t !== 'air' && !t.startsWith('water_')),
      waterPositions: [
        { bx: 5, by: 10, bz: 5 },
        { bx: 6, by: 10, bz: 5 },
        { bx: 7, by: 10, bz: 5 },
      ],
    })
    const changes = computeWaterSpread(opts)
    expect(changes).toContainEqual({ bx: 6, by: 10, bz: 5, value: 'water_source' })
  })
})

import { describe, it, expect } from 'vitest'
import { pickVillageHouseFromPool } from './template-pools'

const TEST_SEED = 12345

/**
 * Returns a small, deterministic sample of (ox, oz) points used for template pool tests.
 */
function getSampleOrigins(): Array<{ ox: number; oz: number }> {
  return [
    { ox: 0, oz: 0 },
    { ox: 16, oz: 16 },
    { ox: -32, oz: 48 },
    { ox: 101, oz: -77 },
    { ox: 2048, oz: 1024 },
  ]
}

describe('template-pools (village house size)', () => {
  it('is deterministic for the same (seed, ox, oz)', () => {
    for (const { ox, oz } of getSampleOrigins()) {
      const a = pickVillageHouseFromPool(TEST_SEED, ox, oz)
      const b = pickVillageHouseFromPool(TEST_SEED, ox, oz)
      expect(b).toBe(a)
    }
  })

  it('produces a mix of sizes across a small grid sample', () => {
    const sizes = new Set<string>()
    const START = -256
    const END = 256
    const STEP = 32
    for (let ox = START; ox <= END; ox += STEP) {
      for (let oz = START; oz <= END; oz += STEP) {
        sizes.add(pickVillageHouseFromPool(TEST_SEED, ox, oz))
      }
    }
    expect(sizes.size).toBeGreaterThan(1)
  })
})


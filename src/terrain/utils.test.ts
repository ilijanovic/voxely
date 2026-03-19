/**
 * Tests for terrain utils. Keep these passing when changing smoothstep, clamp, or RNG.
 */
import { describe, it, expect } from 'vitest'
import { makeSeededRandom, smoothstep, clamp, wrapNoiseCoord } from './utils'

describe('smoothstep', () => {
  it('returns 0 for x <= a', () => {
    expect(smoothstep(0, 1, -1)).toBe(0)
    expect(smoothstep(0, 1, 0)).toBe(0)
    expect(smoothstep(10, 20, 5)).toBe(0)
  })

  it('returns 1 for x >= b', () => {
    expect(smoothstep(0, 1, 1)).toBe(1)
    expect(smoothstep(0, 1, 2)).toBe(1)
    expect(smoothstep(10, 20, 25)).toBe(1)
  })

  it('returns smooth transition between a and b', () => {
    const mid = smoothstep(0, 10, 5)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(mid).toBeCloseTo(0.5, 5)
  })

  it('is symmetric for (0,1) at 0.5', () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 10)
  })
})

describe('clamp', () => {
  it('clamps to [lo, hi]', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it('with lo > hi returns lo (current impl: max(lo, min(hi, x)))', () => {
    expect(clamp(5, 10, 0)).toBe(10)
  })
})

describe('makeSeededRandom', () => {
  it('returns values in [0, 1]', () => {
    const rng = makeSeededRandom(12345)
    for (let i = 0; i < 100; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic for same seed', () => {
    const a = makeSeededRandom(42)
    const b = makeSeededRandom(42)
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b())
    }
  })

  it('produces different sequence for different seeds', () => {
    const a = makeSeededRandom(1)
    const b = makeSeededRandom(2)
    const valuesA = Array.from({ length: 10 }, () => a())
    const valuesB = Array.from({ length: 10 }, () => b())
    expect(valuesA).not.toEqual(valuesB)
  })
})

describe('wrapNoiseCoord', () => {
  it('returns input unchanged when within wrap bounds', () => {
    expect(wrapNoiseCoord(42, 1024)).toBe(42)
    expect(wrapNoiseCoord(-512, 1024)).toBe(-512)
  })

  it('wraps positive and negative values deterministically', () => {
    expect(wrapNoiseCoord(2050, 1024)).toBe(2)
    expect(wrapNoiseCoord(-1, 1024)).toBe(-1)
    expect(wrapNoiseCoord(-2050, 1024)).toBe(1022)
  })
})

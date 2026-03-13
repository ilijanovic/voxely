/**
 * Tests for Three.js ImprovedNoise wrapper: determinism of noise2D and noise2DSeeded.
 */
import { describe, it, expect } from 'vitest'
import { noise2D, noise2DSeeded } from './noise-improved'

describe('noise-improved', () => {
  describe('noise2D', () => {
    it('returns the same value for the same inputs', () => {
      const x = 10.5
      const z = -3.2
      expect(noise2D(x, z)).toBe(noise2D(x, z))
    })

    it('returns values in approximately [-1, 1] for typical inputs', () => {
      const v = noise2D(0, 0)
      expect(v).toBeGreaterThanOrEqual(-1.5)
      expect(v).toBeLessThanOrEqual(1.5)
    })
  })

  describe('noise2DSeeded', () => {
    it('returns the same value for the same (x, z, seed)', () => {
      const x = 1
      const z = 2
      const seed = 12345
      expect(noise2DSeeded(x, z, seed)).toBe(noise2DSeeded(x, z, seed))
    })

    it('returns different values for different seeds at the same (x, z)', () => {
      const x = 1
      const z = 2
      const a = noise2DSeeded(x, z, 100)
      const b = noise2DSeeded(x, z, 200)
      expect(a).not.toBe(b)
    })

    it('returns different values for different (x, z) at the same seed', () => {
      const seed = 456
      const a = noise2DSeeded(0, 0, seed)
      const b = noise2DSeeded(1, 1, seed)
      expect(a).not.toBe(b)
    })
  })
})

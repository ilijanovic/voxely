/**
 * Unit tests for ore feature: triangular Y distribution and deterministic behavior.
 */
import { describe, it, expect } from 'vitest'
import { triangularWeight } from './ore'

describe('triangularWeight', () => {
  it('returns 0 below minY and above maxY', () => {
    expect(triangularWeight(-1, 0, 64, 32)).toBe(0)
    expect(triangularWeight(65, 0, 64, 32)).toBe(0)
  })

  it('returns 1 at peakY', () => {
    expect(triangularWeight(32, 0, 64, 32)).toBe(1)
    expect(triangularWeight(8, 0, 32, 8)).toBe(1)
  })

  it('ramps up from minY to peakY and down from peakY to maxY', () => {
    expect(triangularWeight(0, 0, 64, 32)).toBe(0)
    expect(triangularWeight(16, 0, 64, 32)).toBe(0.5)
    expect(triangularWeight(48, 0, 64, 32)).toBe(0.5)
    expect(triangularWeight(64, 0, 64, 32)).toBe(0)
  })

  it('returns 1 when peakY at boundary (degenerate triangle)', () => {
    expect(triangularWeight(10, 0, 32, 0)).toBe(1)
    expect(triangularWeight(10, 0, 32, 32)).toBe(1)
  })
})

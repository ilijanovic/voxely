import { describe, expect, it } from 'vitest'
import {
  evaluatePlacementCell,
  getBreakDurationForMode,
  getBreakReach,
  getPlaceReach,
} from './block-rules'

describe('block-rules', () => {
  it('uses Java-like reach values by mode', () => {
    expect(getBreakReach('survival')).toBe(4.5)
    expect(getBreakReach('creative')).toBe(5)
    expect(getPlaceReach('survival')).toBe(4.5)
    expect(getPlaceReach('creative')).toBe(5)
  })

  it('returns instant break in creative mode', () => {
    expect(getBreakDurationForMode('stone', 'wood_pickaxe', 'creative')).toBe(0)
  })

  it('rejects placement when slot is empty', () => {
    const result = evaluatePlacementCell({
      selectedType: 'stone',
      selectedCount: 0,
      occupiedType: 'air',
    })
    expect(result).toEqual({ allowed: false, reason: 'slot_empty' })
  })

  it('rejects placement in occupied non-replaceable cell', () => {
    const result = evaluatePlacementCell({
      selectedType: 'stone',
      selectedCount: 1,
      occupiedType: 'stone',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('occupied_not_replaceable')
  })
})

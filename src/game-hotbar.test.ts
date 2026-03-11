import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.stubGlobal('document', {
  querySelectorAll: () => ({ forEach: () => {} }),
})

import { initDefaultInventory } from './inventory'
import {
  getSelectedBlockType,
  getSelectedHotbarIndex,
  setHotbarIndex,
  addBlockToInventory,
  consumeOneFromSelectedSlot,
  getSelectedSlotCount,
  setOnHotbarChange,
  notifyHotbarChange,
  attachHotbarToInventory,
} from './game-hotbar'

describe('game-hotbar', () => {
  beforeEach(() => {
    setOnHotbarChange(null)
    initDefaultInventory()
    attachHotbarToInventory()
    setHotbarIndex(0)
  })

  describe('setHotbarIndex / getSelectedHotbarIndex', () => {
    it('selects valid index', () => {
      setHotbarIndex(3)
      expect(getSelectedHotbarIndex()).toBe(3)
    })

    it('wraps positive index modulo 9', () => {
      setHotbarIndex(9)
      expect(getSelectedHotbarIndex()).toBe(0)
      setHotbarIndex(11)
      expect(getSelectedHotbarIndex()).toBe(2)
    })

    it('wraps negative index modulo 9', () => {
      setHotbarIndex(-1)
      expect(getSelectedHotbarIndex()).toBe(8)
      setHotbarIndex(-10)
      expect(getSelectedHotbarIndex()).toBe(8)
    })
  })

  describe('getSelectedBlockType', () => {
    it('returns block type at selected index', () => {
      setHotbarIndex(0)
      expect(getSelectedBlockType()).toBe('wood_sword')
      setHotbarIndex(3)
      expect(getSelectedBlockType()).toBe('stone')
    })
  })

  describe('addBlockToInventory', () => {
    it('stacks onto existing slot with same block type', () => {
      const cb = vi.fn()
      setOnHotbarChange(cb)
      setHotbarIndex(3)
      const countBefore = getSelectedSlotCount()
      addBlockToInventory('stone')
      expect(getSelectedSlotCount()).toBe(countBefore + 1)
      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('fires onHotbarChange callback', () => {
      const cb = vi.fn()
      setOnHotbarChange(cb)
      addBlockToInventory('stone')
      expect(cb).toHaveBeenCalledTimes(1)
      const [blocks, counts] = cb.mock.calls[0]
      expect(Array.isArray(blocks)).toBe(true)
      expect(Array.isArray(counts)).toBe(true)
    })
  })

  describe('consumeOneFromSelectedSlot', () => {
    it('decrements count and returns true when slot has items', () => {
      setHotbarIndex(0)
      const countBefore = getSelectedSlotCount()
      if (countBefore > 0) {
        const result = consumeOneFromSelectedSlot()
        expect(result).toBe(true)
        expect(getSelectedSlotCount()).toBe(countBefore - 1)
      }
    })

    it('returns false when slot is empty', () => {
      setHotbarIndex(0)
      while (getSelectedSlotCount() > 0) {
        consumeOneFromSelectedSlot()
      }
      expect(consumeOneFromSelectedSlot()).toBe(false)
    })

    it('fires onHotbarChange on successful consume', () => {
      setHotbarIndex(8)
      addBlockToInventory('torch')
      const cb = vi.fn()
      setOnHotbarChange(cb)
      consumeOneFromSelectedSlot()
      expect(cb).toHaveBeenCalled()
    })
  })

  describe('notifyHotbarChange', () => {
    it('calls onHotbarChange with current state', () => {
      const cb = vi.fn()
      setOnHotbarChange(cb)
      notifyHotbarChange()
      expect(cb).toHaveBeenCalledTimes(1)
      const [blocks, counts] = cb.mock.calls[0]
      expect(blocks).toHaveLength(9)
      expect(counts).toHaveLength(9)
    })

    it('does not throw when no callback set', () => {
      setOnHotbarChange(null)
      expect(() => notifyHotbarChange()).not.toThrow()
    })
  })
})

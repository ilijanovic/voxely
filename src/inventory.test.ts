/**
 * Tests for inventory state: slots, add/consume/move, crafting grid, persistent slots, and init.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getSlot,
  setSlot,
  getHotbarSlots,
  getMainInventorySlots,
  getCraftingSlots,
  getAllSlots,
  addItem,
  consumeFromSlot,
  consumeByType,
  moveSlots,
  clearCraftingGrid,
  craftOne,
  getPersistentSlots,
  setPersistentSlots,
  initDefaultInventory,
  INVENTORY_SLOT_COUNT,
  MAIN_INVENTORY_START,
  CRAFTING_START,
} from './inventory'
import {
  HOTBAR_SLOTS,
  MAIN_INVENTORY_SLOTS,
  CRAFTING_GRID_2X2,
  MAX_STACK_SIZE,
  TOTAL_PERSISTENT_SLOTS,
} from './constants'

describe('inventory', () => {
  beforeEach(() => {
    initDefaultInventory()
  })

  describe('getSlot / setSlot', () => {
    it('returns empty slot for out-of-bounds index', () => {
      expect(getSlot(-1)).toEqual({ type: null, count: 0 })
      expect(getSlot(INVENTORY_SLOT_COUNT)).toEqual({ type: null, count: 0 })
    })

    it('ignores setSlot for out-of-bounds index', () => {
      setSlot(-1, 'dirt', 1)
      setSlot(INVENTORY_SLOT_COUNT, 'dirt', 1)
      expect(getSlot(0).type).toBe('wood_sword')
    })

    it('sets and gets slot in range', () => {
      setSlot(MAIN_INVENTORY_START, 'dirt', 10)
      expect(getSlot(MAIN_INVENTORY_START)).toEqual({ type: 'dirt', count: 10 })
    })

    it('clamps count to MAX_STACK_SIZE', () => {
      setSlot(0, 'dirt', 999)
      expect(getSlot(0).count).toBe(MAX_STACK_SIZE)
    })

    it('clears slot when count is 0 or negative', () => {
      setSlot(MAIN_INVENTORY_START, 'dirt', 5)
      setSlot(MAIN_INVENTORY_START, 'dirt', 0)
      expect(getSlot(MAIN_INVENTORY_START)).toEqual({ type: null, count: 0 })
    })
  })

  describe('getHotbarSlots / getMainInventorySlots / getCraftingSlots', () => {
    it('returns correct slot count for each region', () => {
      expect(getHotbarSlots()).toHaveLength(HOTBAR_SLOTS)
      expect(getMainInventorySlots()).toHaveLength(MAIN_INVENTORY_SLOTS)
      expect(getCraftingSlots()).toHaveLength(CRAFTING_GRID_2X2)
    })

    it('getAllSlots returns INVENTORY_SLOT_COUNT slots', () => {
      expect(getAllSlots()).toHaveLength(INVENTORY_SLOT_COUNT)
    })
  })

  describe('addItem', () => {
    it('stacks onto existing slot of same type in hotbar', () => {
      setSlot(2, 'dirt', 1)
      addItem('dirt', 5)
      expect(getSlot(2)).toEqual({ type: 'dirt', count: 6 })
    })

    it('fills first empty hotbar slot when no stack available', () => {
      for (let i = 0; i < HOTBAR_SLOTS; i++) setSlot(i, null, 0)
      setSlot(0, 'wood_sword', 1)
      setSlot(1, 'grass', 1)
      addItem('sand', 3)
      expect(getSlot(2)).toEqual({ type: 'sand', count: 3 })
    })

    it('does not exceed MAX_STACK_SIZE per slot', () => {
      for (let i = 0; i < HOTBAR_SLOTS; i++) setSlot(i, 'dirt', 1)
      setSlot(MAIN_INVENTORY_START, 'stone', MAX_STACK_SIZE - 2)
      addItem('stone', 5)
      expect(getSlot(MAIN_INVENTORY_START).count).toBe(MAX_STACK_SIZE)
    })
  })

  describe('consumeFromSlot', () => {
    it('returns 0 for out-of-bounds or non-positive amount', () => {
      expect(consumeFromSlot(-1, 1)).toBe(0)
      expect(consumeFromSlot(0, 0)).toBe(0)
    })

    it('consumes up to amount and returns actual consumed', () => {
      setSlot(0, 'dirt', 5)
      expect(consumeFromSlot(0, 2)).toBe(2)
      expect(getSlot(0)).toEqual({ type: 'dirt', count: 3 })
    })

    it('clears slot when consume exhausts stack', () => {
      setSlot(0, 'dirt', 3)
      expect(consumeFromSlot(0, 3)).toBe(3)
      expect(getSlot(0)).toEqual({ type: null, count: 0 })
    })
  })

  describe('consumeByType', () => {
    it('consumes matching stacks from hotbar then main inventory', () => {
      for (let i = 0; i < TOTAL_PERSISTENT_SLOTS; i++) setSlot(i, null, 0)
      setSlot(0, 'dirt', 2)
      setSlot(1, 'dirt', 3)
      setSlot(MAIN_INVENTORY_START, 'dirt', 5)
      expect(consumeByType('dirt', 6)).toBe(6)
      expect(getSlot(0)).toEqual({ type: null, count: 0 })
      expect(getSlot(1)).toEqual({ type: null, count: 0 })
      expect(getSlot(MAIN_INVENTORY_START)).toEqual({ type: 'dirt', count: 4 })
    })

    it('returns consumed amount when inventory has fewer items than requested', () => {
      for (let i = 0; i < TOTAL_PERSISTENT_SLOTS; i++) setSlot(i, null, 0)
      setSlot(0, 'sand', 1)
      setSlot(MAIN_INVENTORY_START, 'sand', 2)
      expect(consumeByType('sand', 10)).toBe(3)
      expect(getSlot(0)).toEqual({ type: null, count: 0 })
      expect(getSlot(MAIN_INVENTORY_START)).toEqual({ type: null, count: 0 })
    })
  })

  describe('moveSlots', () => {
    it('returns false for same index or out-of-bounds', () => {
      expect(moveSlots(0, 0, 1)).toBe(false)
      expect(moveSlots(-1, 1, 1)).toBe(false)
      expect(moveSlots(0, INVENTORY_SLOT_COUNT, 1)).toBe(false)
    })

    it('moves to empty slot', () => {
      setSlot(0, 'dirt', 5)
      setSlot(MAIN_INVENTORY_START, null, 0) // ensure dest is empty so we move, not swap
      expect(moveSlots(0, MAIN_INVENTORY_START)).toBe(true)
      expect(getSlot(0)).toEqual({ type: null, count: 0 })
      expect(getSlot(MAIN_INVENTORY_START)).toEqual({ type: 'dirt', count: 5 })
    })

    it('merges stacks of same type up to MAX_STACK_SIZE', () => {
      setSlot(0, 'dirt', 60)
      setSlot(MAIN_INVENTORY_START, 'dirt', 10)
      expect(moveSlots(0, MAIN_INVENTORY_START)).toBe(true)
      expect(getSlot(MAIN_INVENTORY_START).count).toBe(MAX_STACK_SIZE)
      expect(getSlot(0).count).toBe(60 - (MAX_STACK_SIZE - 10))
    })

    it('swaps when types differ and full move', () => {
      setSlot(0, 'dirt', 1)
      setSlot(MAIN_INVENTORY_START, 'stone', 1)
      expect(moveSlots(0, MAIN_INVENTORY_START)).toBe(true)
      expect(getSlot(0)).toEqual({ type: 'stone', count: 1 })
      expect(getSlot(MAIN_INVENTORY_START)).toEqual({ type: 'dirt', count: 1 })
    })
  })

  describe('clearCraftingGrid', () => {
    it('clears slots 36–39', () => {
      setSlot(CRAFTING_START, 'oak_planks', 1)
      setSlot(CRAFTING_START + 1, 'oak_planks', 1)
      clearCraftingGrid()
      expect(getSlot(CRAFTING_START)).toEqual({ type: null, count: 0 })
      expect(getSlot(CRAFTING_START + 3)).toEqual({ type: null, count: 0 })
    })
  })

  describe('craftOne', () => {
    it('returns false when grid does not match a recipe', () => {
      setSlot(CRAFTING_START, 'dirt', 1)
      expect(craftOne()).toBe(false)
    })

    it('consumes ingredients and adds result for 4 oak_planks -> crafting_table', () => {
      setSlot(CRAFTING_START, 'oak_planks', 1)
      setSlot(CRAFTING_START + 1, 'oak_planks', 1)
      setSlot(CRAFTING_START + 2, 'oak_planks', 1)
      setSlot(CRAFTING_START + 3, 'oak_planks', 1)
      expect(craftOne()).toBe(true)
      expect(getSlot(CRAFTING_START)).toEqual({ type: null, count: 0 })
      expect(getSlot(CRAFTING_START + 3)).toEqual({ type: null, count: 0 })
      const main = getMainInventorySlots()
      const craftingTable = main.find((s) => s.type === 'crafting_table')
      expect(craftingTable?.count).toBe(1)
    })
  })

  describe('getPersistentSlots / setPersistentSlots', () => {
    it('roundtrips hotbar and main inventory', () => {
      setSlot(0, 'dirt', 10)
      setSlot(MAIN_INVENTORY_START, 'stone', 5)
      const snapshot = getPersistentSlots()
      initDefaultInventory()
      setPersistentSlots(snapshot)
      expect(getSlot(0)).toEqual({ type: 'dirt', count: 10 })
      expect(getSlot(MAIN_INVENTORY_START)).toEqual({ type: 'stone', count: 5 })
    })

    it('clears crafting grid when restoring persistent slots', () => {
      setSlot(CRAFTING_START, 'oak_planks', 1)
      const snapshot = getPersistentSlots()
      setPersistentSlots(snapshot)
      expect(getSlot(CRAFTING_START)).toEqual({ type: null, count: 0 })
    })
  })

  describe('initDefaultInventory', () => {
    it('sets default hotbar and empty main inventory', () => {
      initDefaultInventory()
      expect(getSlot(0).type).toBe('wood_sword')
      expect(getSlot(3).type).toBe('dirt')
      expect(getSlot(4).type).toBe('stone')
      expect(getSlot(MAIN_INVENTORY_START).type).toBe('oak_fence')
    })
  })
})

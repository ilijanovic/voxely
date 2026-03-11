/**
 * Tests for shared world/chunk/UI constants. Ensures contract values stay stable across terrain, chunk, and game code.
 */
import { describe, it, expect } from 'vitest'
import {
  BLOCK_SIZE,
  CHUNK_SIZE,
  DEFAULT_BLOCK_TEXTURE_PATH,
  DEFAULT_ITEM_TEXTURE_PATH,
  RENDER_DISTANCE,
  RENDER_DISTANCE_SQ,
  WORLD_HEIGHT,
  WATER_LEVEL,
  MAX_STACK_SIZE,
  HOTBAR_SLOTS,
  MAIN_INVENTORY_ROWS,
  MAIN_INVENTORY_COLS,
  MAIN_INVENTORY_SLOTS,
  CRAFTING_GRID_2X2,
  TOTAL_PERSISTENT_SLOTS,
  SPAWN_X,
  SPAWN_Z,
  getBlockTexturePath,
  getItemTexturePath,
} from './constants'

describe('constants', () => {
  describe('chunk and world', () => {
    it('BLOCK_SIZE is 1', () => {
      expect(BLOCK_SIZE).toBe(1)
    })

    it('CHUNK_SIZE is 16', () => {
      expect(CHUNK_SIZE).toBe(16)
    })

    it('WORLD_HEIGHT is 128', () => {
      expect(WORLD_HEIGHT).toBe(128)
    })

    it('WATER_LEVEL is 64', () => {
      expect(WATER_LEVEL).toBe(64)
    })

    it('RENDER_DISTANCE_SQ equals RENDER_DISTANCE squared', () => {
      expect(RENDER_DISTANCE_SQ).toBe(RENDER_DISTANCE * RENDER_DISTANCE)
    })
  })

  describe('inventory and UI', () => {
    it('MAIN_INVENTORY_SLOTS equals rows times cols', () => {
      expect(MAIN_INVENTORY_SLOTS).toBe(MAIN_INVENTORY_ROWS * MAIN_INVENTORY_COLS)
    })

    it('TOTAL_PERSISTENT_SLOTS equals hotbar plus main inventory', () => {
      expect(TOTAL_PERSISTENT_SLOTS).toBe(HOTBAR_SLOTS + MAIN_INVENTORY_SLOTS)
    })

    it('HOTBAR_SLOTS is 9', () => {
      expect(HOTBAR_SLOTS).toBe(9)
    })

    it('MAX_STACK_SIZE is 64', () => {
      expect(MAX_STACK_SIZE).toBe(64)
    })

    it('CRAFTING_GRID_2X2 is 4', () => {
      expect(CRAFTING_GRID_2X2).toBe(4)
    })
  })

  describe('spawn', () => {
    it('SPAWN_X and SPAWN_Z are 0', () => {
      expect(SPAWN_X).toBe(0)
      expect(SPAWN_Z).toBe(0)
    })
  })

  describe('default texture paths', () => {
    it('DEFAULT_BLOCK_TEXTURE_PATH is non-empty and points to block textures', () => {
      expect(DEFAULT_BLOCK_TEXTURE_PATH).toBe('/assets/minecraft/textures/block')
    })

    it('DEFAULT_ITEM_TEXTURE_PATH is non-empty and points to item textures', () => {
      expect(DEFAULT_ITEM_TEXTURE_PATH).toBe('/assets/minecraft/textures/items')
    })
  })

  describe('getBlockTexturePath / getItemTexturePath', () => {
    it('return default paths when window is undefined (e.g. Node test env)', () => {
      expect(getBlockTexturePath()).toBe(DEFAULT_BLOCK_TEXTURE_PATH)
      expect(getItemTexturePath()).toBe(DEFAULT_ITEM_TEXTURE_PATH)
    })
  })
})

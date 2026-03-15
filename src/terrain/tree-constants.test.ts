/**
 * Tests for tree shape config and constants. Ensures biome -> shape mapping stays consistent for terrain and game-terrain.
 */
import { describe, it, expect } from 'vitest'
import {
  getTreeShapeConfigForBiome,
  TREE_SHAPE_DEFAULT,
  TREE_SHAPE_FOREST,
  TREE_SHAPE_JUNGLE,
  TREE_SHAPE_MOUNTAIN,
  TREE_SHAPE_SNOW,
  FOREST_DENSITY_SCALE,
  TREE_PLACEMENT_SCALE,
  TREE_MAX_SLOPE,
  MEADOW_BEE_NEST_CHANCE,
} from './tree-constants'

describe('tree-constants', () => {
  describe('getTreeShapeConfigForBiome', () => {
    it('returns TREE_SHAPE_SNOW for snow and grove', () => {
      expect(getTreeShapeConfigForBiome('snow')).toBe(TREE_SHAPE_SNOW)
      expect(getTreeShapeConfigForBiome('grove')).toBe(TREE_SHAPE_SNOW)
    })

    it('returns TREE_SHAPE_FOREST for forest and windswept_forest', () => {
      expect(getTreeShapeConfigForBiome('forest')).toBe(TREE_SHAPE_FOREST)
      expect(getTreeShapeConfigForBiome('windswept_forest')).toBe(TREE_SHAPE_FOREST)
    })

    it('returns TREE_SHAPE_JUNGLE for jungle', () => {
      expect(getTreeShapeConfigForBiome('jungle')).toBe(TREE_SHAPE_JUNGLE)
    })

    it('returns TREE_SHAPE_MOUNTAIN for mountain', () => {
      expect(getTreeShapeConfigForBiome('mountain')).toBe(TREE_SHAPE_MOUNTAIN)
    })

    it('returns TREE_SHAPE_DEFAULT for plains and other biomes', () => {
      expect(getTreeShapeConfigForBiome('plains')).toBe(TREE_SHAPE_DEFAULT)
      expect(getTreeShapeConfigForBiome('ocean')).toBe(TREE_SHAPE_DEFAULT)
      expect(getTreeShapeConfigForBiome('desert')).toBe(TREE_SHAPE_DEFAULT)
      expect(getTreeShapeConfigForBiome('meadow')).toBe(TREE_SHAPE_DEFAULT)
      expect(getTreeShapeConfigForBiome('windswept_hills')).toBe(TREE_SHAPE_DEFAULT)
    })

    it('returns config with expected structure for default', () => {
      const config = getTreeShapeConfigForBiome('plains')
      expect(config.trunkMin).toBeLessThanOrEqual(config.trunkMax)
      expect(config.leafRadiusMin).toBeLessThanOrEqual(config.leafRadiusMax)
      expect(config.leafHeightMin).toBeLessThanOrEqual(config.leafHeightMax)
      expect(config.giantChance).toBeGreaterThanOrEqual(0)
      expect(config.giantChance).toBeLessThanOrEqual(1)
    })
  })

  describe('constants', () => {
    it('FOREST_DENSITY_SCALE and TREE_PLACEMENT_SCALE are positive', () => {
      expect(FOREST_DENSITY_SCALE).toBeGreaterThan(0)
      expect(TREE_PLACEMENT_SCALE).toBeGreaterThan(0)
    })

    it('TREE_MAX_SLOPE is positive', () => {
      expect(TREE_MAX_SLOPE).toBeGreaterThan(0)
    })

    it('MEADOW_BEE_NEST_CHANCE is a valid probability', () => {
      expect(MEADOW_BEE_NEST_CHANCE).toBeGreaterThan(0)
      expect(MEADOW_BEE_NEST_CHANCE).toBeLessThanOrEqual(1)
    })
  })
})

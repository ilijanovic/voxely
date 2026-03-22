import { describe, expect, it } from 'vitest'
import {
  canHarvestBlockForDrops,
  getBlockBlastResistance,
  getBlockLightEmission,
  getToolTier,
  hasBlockTag,
  requiresCorrectToolForDrops,
} from './block-registry'

describe('block-registry metadata extensions', () => {
  it('exposes blast resistance and light emission', () => {
    expect(getBlockBlastResistance('stone')).toBeGreaterThan(0)
    expect(getBlockLightEmission('torch')).toBe(14)
    expect(getBlockLightEmission('stone')).toBe(0)
  })

  it('exposes tags and required-tool drop rules', () => {
    expect(hasBlockTag('coal_ore', 'ores')).toBe(true)
    expect(hasBlockTag('dirt', 'mineable/shovel')).toBe(true)
    expect(requiresCorrectToolForDrops('stone')).toBe(true)
    expect(requiresCorrectToolForDrops('dirt')).toBe(false)
  })

  it('enforces harvest tool category and tier', () => {
    expect(getToolTier('wood_pickaxe')).toBe(1)
    expect(getToolTier('iron_pickaxe')).toBe(3)
    expect(canHarvestBlockForDrops('diamond_ore', 'stone_pickaxe')).toBe(false)
    expect(canHarvestBlockForDrops('diamond_ore', 'iron_pickaxe')).toBe(true)
    expect(canHarvestBlockForDrops('redstone_ore', 'stone_pickaxe')).toBe(false)
    expect(canHarvestBlockForDrops('lapis_ore', 'stone_pickaxe')).toBe(true)
    expect(canHarvestBlockForDrops('stone', 'wood_axe')).toBe(false)
  })
})

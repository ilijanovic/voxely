import { describe, expect, it, vi } from 'vitest'
import { resolveBlockLoot } from './block-loot'

describe('resolveBlockLoot', () => {
  it('returns no drop when required tool is missing', () => {
    const result = resolveBlockLoot({ blockType: 'stone' })
    expect(result.dropType).toBe(null)
    expect(result.count).toBe(0)
  })

  it('returns block drop for stone when pickaxe is used', () => {
    const result = resolveBlockLoot({ blockType: 'stone', heldItemId: 'wood_pickaxe' })
    expect(result.dropType).toBe('stone')
    expect(result.count).toBe(1)
  })

  it('returns ore-specific drop for coal ore', () => {
    const result = resolveBlockLoot({ blockType: 'coal_ore', heldItemId: 'wood_pickaxe' })
    expect(result.dropType).toBe('coal')
    expect(result.count).toBeGreaterThanOrEqual(1)
  })

  it('drops raw iron for iron ore with a valid pickaxe tier', () => {
    const result = resolveBlockLoot({ blockType: 'iron_ore', heldItemId: 'stone_pickaxe' })
    expect(result.dropType).toBe('raw_iron')
    expect(result.count).toBe(1)
  })

  it('drops nothing for diamond ore with stone pickaxe (tier too low)', () => {
    const result = resolveBlockLoot({ blockType: 'diamond_ore', heldItemId: 'stone_pickaxe' })
    expect(result.dropType).toBe(null)
    expect(result.count).toBe(0)
  })

  it('drops diamond for diamond ore with iron pickaxe', () => {
    const result = resolveBlockLoot({ blockType: 'diamond_ore', heldItemId: 'iron_pickaxe' })
    expect(result.dropType).toBe('diamond')
    expect(result.count).toBe(1)
  })

  it('drops lapis for lapis ore with stone pickaxe', () => {
    const result = resolveBlockLoot({ blockType: 'lapis_ore', heldItemId: 'stone_pickaxe' })
    expect(result.dropType).toBe('lapis_lazuli')
    expect(result.count).toBe(1)
  })

  it('drops no redstone when pickaxe tier is too low', () => {
    const result = resolveBlockLoot({ blockType: 'redstone_ore', heldItemId: 'stone_pickaxe' })
    expect(result.dropType).toBe(null)
    expect(result.count).toBe(0)
  })

  it('supports silk touch override', () => {
    const result = resolveBlockLoot({
      blockType: 'coal_ore',
      heldItemId: 'wood_pickaxe',
      enchantments: { silkTouch: true },
    })
    expect(result.dropType).toBe('coal_ore')
    expect(result.count).toBe(1)
  })

  it('increases ore drops with fortune', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const result = resolveBlockLoot({
      blockType: 'coal_ore',
      heldItemId: 'wood_pickaxe',
      enchantments: { fortuneLevel: 3 },
    })
    expect(result.dropType).toBe('coal')
    expect(result.count).toBeGreaterThan(1)
  })
})

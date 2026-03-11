/**
 * Tests for 2x2 recipe matching and consume-amount calculation. Ensures crafting grid logic stays correct.
 */
import { describe, it, expect } from 'vitest'
import { matchRecipe2x2, getConsumeAmountsForCraft } from './recipes-registry'
import type { Recipe2x2 } from './recipes-types'

describe('matchRecipe2x2', () => {
  it('returns null for empty or short grid', () => {
    expect(matchRecipe2x2([])).toBeNull()
    expect(matchRecipe2x2([null, null])).toBeNull()
  })

  it('returns null when grid does not match any recipe', () => {
    expect(matchRecipe2x2([null, null, null, null])).toBeNull()
    expect(matchRecipe2x2(['dirt', 'dirt', 'dirt', 'dirt'])).toBeNull()
  })

  it('matches shapeless: 1 wood -> 4 oak_planks', () => {
    const grid = ['wood', null, null, null]
    const match = matchRecipe2x2(grid)
    expect(match).not.toBeNull()
    expect(match!.result.type).toBe('oak_planks')
    expect(match!.result.count).toBe(4)
  })

  it('matches shaped: 4 oak_planks -> crafting_table', () => {
    const grid = ['oak_planks', 'oak_planks', 'oak_planks', 'oak_planks']
    const match = matchRecipe2x2(grid)
    expect(match).not.toBeNull()
    expect(match!.result.type).toBe('crafting_table')
    expect(match!.result.count).toBe(1)
  })

  it('matches stick recipe (2 oak_planks top row)', () => {
    const grid = ['oak_planks', 'oak_planks', null, null]
    const match = matchRecipe2x2(grid)
    expect(match).not.toBeNull()
    expect(match!.result.type).toBe('stick')
    expect(match!.result.count).toBe(4)
  })

  it('matches wood_sword recipe', () => {
    const grid = ['oak_planks', 'oak_planks', 'stick', null]
    const match = matchRecipe2x2(grid)
    expect(match).not.toBeNull()
    expect(match!.result.type).toBe('wood_sword')
    expect(match!.result.count).toBe(1)
  })

  it('matches shapeless torch: stick + coal', () => {
    const grid = ['stick', 'coal', null, null]
    const match = matchRecipe2x2(grid)
    expect(match).not.toBeNull()
    expect(match!.result.type).toBe('torch')
    expect(match!.result.count).toBe(4)
  })
})

describe('getConsumeAmountsForCraft', () => {
  it('returns zeros for short grid', () => {
    expect(getConsumeAmountsForCraft(
      { kind: 'shaped_2x2', pattern: ['oak_planks', 'oak_planks', null, null], result: { type: 'stick', count: 4 } },
      [],
    )).toEqual([0, 0, 0, 0])
  })

  it('returns 1 per pattern slot for shaped recipe', () => {
    const recipe: Recipe2x2 = {
      kind: 'shaped_2x2',
      pattern: ['oak_planks', 'oak_planks', 'oak_planks', 'oak_planks'],
      result: { type: 'crafting_table', count: 1 },
    }
    const grid = [
      { type: 'oak_planks' as const, count: 1 },
      { type: 'oak_planks' as const, count: 1 },
      { type: 'oak_planks' as const, count: 1 },
      { type: 'oak_planks' as const, count: 1 },
    ]
    expect(getConsumeAmountsForCraft(recipe, grid)).toEqual([1, 1, 1, 1])
  })

  it('consumes correct amounts for shapeless recipe', () => {
    const recipe: Recipe2x2 = {
      kind: 'shapeless',
      ingredients: [{ type: 'stick', count: 1 }, { type: 'coal', count: 1 }],
      result: { type: 'torch', count: 4 },
    }
    const grid = [
      { type: 'stick' as const, count: 2 },
      { type: 'coal' as const, count: 1 },
      { type: null, count: 0 },
      { type: null, count: 0 },
    ]
    const amounts = getConsumeAmountsForCraft(recipe, grid)
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(2)
    expect(amounts[0]).toBe(1)
    expect(amounts[1]).toBe(1)
  })
})

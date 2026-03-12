/**
 * Tests for 2x2 and 3x3 recipe matching and consume-amount calculation. Ensures crafting grid logic stays correct.
 */
import { describe, it, expect } from 'vitest'
import {
  matchRecipe2x2,
  getConsumeAmountsForCraft,
  matchRecipe3x3,
  getConsumeAmountsForCraft3x3,
  getConsumeAmountsForCraft3x3FromMatch,
} from './recipes-registry'
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

  it('matches stick recipe (2 oak_planks left column)', () => {
    const grid = ['oak_planks', null, 'oak_planks', null]
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

  it('matches wood_shovel recipe (1 plank + 1 stick in 2×2)', () => {
    const grid = ['oak_planks', null, 'stick', null]
    const match = matchRecipe2x2(grid)
    expect(match).not.toBeNull()
    expect(match!.result.type).toBe('wood_shovel')
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

describe('matchRecipe3x3', () => {
  it('returns null for short grid', () => {
    expect(matchRecipe3x3([])).toBeNull()
    expect(matchRecipe3x3([null, null, null])).toBeNull()
  })

  it('matches sticks (2 planks top row)', () => {
    const grid = ['oak_planks', 'oak_planks', null, null, null, null, null, null, null]
    const match = matchRecipe3x3(grid)
    expect(match).not.toBeNull()
    expect(match!.result.type).toBe('stick')
    expect(match!.result.count).toBe(4)
  })

  it('matches sticks (2 planks left column)', () => {
    const grid = ['oak_planks', null, null, 'oak_planks', null, null, null, null, null]
    const match = matchRecipe3x3(grid)
    expect(match).not.toBeNull()
    expect(match!.result.type).toBe('stick')
    expect(match!.result.count).toBe(4)
  })

  it('matches wood_sword (2 planks + stick)', () => {
    const grid = ['oak_planks', 'oak_planks', null, null, 'stick', null, null, null, null]
    const match = matchRecipe3x3(grid)
    expect(match).not.toBeNull()
    expect(match!.result.type).toBe('wood_sword')
    expect(match!.result.count).toBe(1)
  })

  it('matches wood_shovel (1 plank + 2 sticks vertical)', () => {
    const grid = [null, 'oak_planks', null, null, 'stick', null, null, 'stick', null]
    const match = matchRecipe3x3(grid)
    expect(match).not.toBeNull()
    expect(match!.result.type).toBe('wood_shovel')
    expect(match!.result.count).toBe(1)
  })

  it('matches wood_pickaxe (3 planks top + 2 sticks middle)', () => {
    const grid = ['oak_planks', 'oak_planks', 'oak_planks', null, 'stick', null, null, 'stick', null]
    const match = matchRecipe3x3(grid)
    expect(match).not.toBeNull()
    expect(match!.result.type).toBe('wood_pickaxe')
    expect(match!.result.count).toBe(1)
  })

  it('matches wood_axe (2 planks top + 1 plank middle left + 2 sticks)', () => {
    const grid = ['oak_planks', 'oak_planks', null, 'oak_planks', 'stick', null, null, 'stick', null]
    const match = matchRecipe3x3(grid)
    expect(match).not.toBeNull()
    expect(match!.result.type).toBe('wood_axe')
    expect(match!.result.count).toBe(1)
  })

  it('matches 2×2 recipes in top-left 2×2 of 3×3 (inventory recipes at crafting table)', () => {
    const woodOnly = ['wood', null, null, null, null, null, null, null, null]
    expect(matchRecipe3x3(woodOnly)!.result.type).toBe('oak_planks')
    expect(matchRecipe3x3(woodOnly)!.result.count).toBe(4)

    const twoPlanks = ['oak_planks', 'oak_planks', null, null, null, null, null, null, null]
    const sticksMatch = matchRecipe3x3(twoPlanks)
    expect(sticksMatch).not.toBeNull()
    expect(sticksMatch!.result.type).toBe('stick')
    expect(sticksMatch!.result.count).toBe(4)

    const swordGrid = ['oak_planks', 'oak_planks', null, 'stick', null, null, null, null, null]
    expect(matchRecipe3x3(swordGrid)!.result.type).toBe('wood_sword')
    expect(matchRecipe3x3(swordGrid)!.result.count).toBe(1)

    const shovelGrid = ['oak_planks', null, null, 'stick', null, null, null, null, null]
    expect(matchRecipe3x3(shovelGrid)!.result.type).toBe('wood_shovel')
    expect(matchRecipe3x3(shovelGrid)!.result.count).toBe(1)

    const torchGrid = ['stick', 'coal', null, null, null, null, null, null, null]
    expect(matchRecipe3x3(torchGrid)!.result.type).toBe('torch')
    expect(matchRecipe3x3(torchGrid)!.result.count).toBe(4)
  })

  it('matches 2×2 recipes in any quadrant of 3×3 (e.g. bottom-right)', () => {
    const woodBottomRight = [null, null, null, null, null, null, null, null, 'wood']
    const match = matchRecipe3x3(woodBottomRight)
    expect(match).not.toBeNull()
    expect(match!.result.type).toBe('oak_planks')
    expect(match!.result.count).toBe(4)
    expect('indices' in match! && match!.indices).toEqual([4, 5, 7, 8])

    const torchBottomRight = [null, null, null, null, null, null, null, 'stick', 'coal']
    expect(matchRecipe3x3(torchBottomRight)!.result.type).toBe('torch')
    expect(matchRecipe3x3(torchBottomRight)!.result.count).toBe(4)
  })
})

describe('getConsumeAmountsForCraft3x3', () => {
  it('returns 1 per pattern slot for shaped 3x3', () => {
    const recipe = {
      kind: 'shaped_3x3' as const,
      pattern: [
        'oak_planks',
        'oak_planks',
        'oak_planks',
        null,
        'stick',
        null,
        null,
        'stick',
        null,
      ],
      result: { type: 'wood_pickaxe' as const, count: 1 },
    }
    const grid = Array.from({ length: 9 }, (_, i) =>
      recipe.pattern[i] != null
        ? { type: recipe.pattern[i] as string, count: 2 }
        : { type: null, count: 0 },
    )
    const amounts = getConsumeAmountsForCraft3x3(recipe, grid)
    expect(amounts).toHaveLength(9)
    expect(amounts.reduce((s, a) => s + a, 0)).toBe(5)
    expect(amounts[0]).toBe(1)
    expect(amounts[4]).toBe(1)
    expect(amounts[7]).toBe(1)
  })
})

describe('getConsumeAmountsForCraft3x3FromMatch', () => {
  it('returns amounts for 2×2 match (top-left slots 0,1,3,4 only)', () => {
    const grid = [
      { type: 'stick' as const, count: 1 },
      { type: 'coal' as const, count: 1 },
      { type: null, count: 0 },
      { type: null, count: 0 },
      { type: null, count: 0 },
      { type: null, count: 0 },
      { type: null, count: 0 },
      { type: null, count: 0 },
      { type: null, count: 0 },
    ]
    const match = matchRecipe3x3(grid.map((s) => s.type))
    expect(match).not.toBeNull()
    expect(match!.result.type).toBe('torch')
    const amounts = getConsumeAmountsForCraft3x3FromMatch(match!, grid)
    expect(amounts).toHaveLength(9)
    expect(amounts[0]).toBe(1)
    expect(amounts[1]).toBe(1)
    expect(amounts[3]).toBe(0)
    expect(amounts[4]).toBe(0)
    expect(amounts.reduce((s, a) => s + a, 0)).toBe(2)
  })

  it('returns amounts for 2×2 match in bottom-right quadrant (slots 4,5,7,8)', () => {
    const grid = [
      { type: null, count: 0 },
      { type: null, count: 0 },
      { type: null, count: 0 },
      { type: null, count: 0 },
      { type: null, count: 0 },
      { type: null, count: 0 },
      { type: null, count: 0 },
      { type: 'stick' as const, count: 1 },
      { type: 'coal' as const, count: 1 },
    ]
    const match = matchRecipe3x3(grid.map((s) => s.type))
    expect(match).not.toBeNull()
    expect(match!.result.type).toBe('torch')
    const amounts = getConsumeAmountsForCraft3x3FromMatch(match!, grid)
    expect(amounts).toHaveLength(9)
    expect(amounts[7]).toBe(1)
    expect(amounts[8]).toBe(1)
    expect(amounts.reduce((s, a) => s + a, 0)).toBe(2)
  })
})

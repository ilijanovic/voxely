import { describe, expect, it, vi } from 'vitest'
import { dispatchUseOnBlock } from './block-use-dispatcher'

describe('dispatchUseOnBlock', () => {
  it('toggles doors and updates paired half', () => {
    const setBlockModification = vi.fn()
    const applyBlockChangeToLoadedChunk = vi.fn()
    const getBlockAt = vi.fn((x: number, y: number, z: number) => {
      if (x === 10 && y === 65 && z === 10) return 'door_closed'
      if (x === 10 && y === 66 && z === 10) return 'door_closed'
      return 'air'
    })

    const result = dispatchUseOnBlock({
      blockType: 'door_closed',
      x: 10,
      y: 65,
      z: 10,
      getBlockAt,
      setBlockModification,
      applyBlockChangeToLoadedChunk,
    })

    expect(result.handled).toBe(true)
    expect(setBlockModification).toHaveBeenCalledWith(10, 65, 10, 'door_open')
    expect(setBlockModification).toHaveBeenCalledWith(10, 66, 10, 'door_open')
  })

  it('calls crafting table callback', () => {
    const onCraftingTableUse = vi.fn()
    const result = dispatchUseOnBlock({
      blockType: 'crafting_table',
      x: 0,
      y: 0,
      z: 0,
      getBlockAt: () => 'air',
      setBlockModification: () => undefined,
      applyBlockChangeToLoadedChunk: () => undefined,
      onCraftingTableUse,
    })
    expect(result.handled).toBe(true)
    expect(onCraftingTableUse).toHaveBeenCalledTimes(1)
  })
})

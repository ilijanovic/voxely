import type { BlockType } from '../../types'

/** Context required to process right-click use on an existing block. */
export interface UseBlockDispatchContext {
  blockType: BlockType
  x: number
  y: number
  z: number
  getBlockAt: (x: number, y: number, z: number) => BlockType | 'air' | null
  setBlockModification: (x: number, y: number, z: number, next: BlockType | 'air') => void
  applyBlockChangeToLoadedChunk: (params: { bx: number; by: number; bz: number; next: BlockType }) => void
  onCraftingTableUse?: () => void
}

/** Output of use dispatching. */
export interface UseBlockDispatchResult {
  handled: boolean
}

/**
 * Returns true if the block id belongs to a two-block door state family.
 *
 * @param value - Candidate block id
 * @returns Whether value is a door state
 */
function isDoorBlock(value: string | null): value is BlockType {
  return value === 'door_closed' || value === 'door_open'
}

/**
 * Handles use interaction on the currently targeted block.
 *
 * @param context - Use context
 * @returns Handled flag
 */
export function dispatchUseOnBlock(context: UseBlockDispatchContext): UseBlockDispatchResult {
  if (isDoorBlock(context.blockType)) {
    const next = context.blockType === 'door_closed' ? 'door_open' : 'door_closed'
    const above = context.getBlockAt(context.x, context.y + 1, context.z)
    const below = context.getBlockAt(context.x, context.y - 1, context.z)
    const otherBy = isDoorBlock(above) ? context.y + 1 : isDoorBlock(below) ? context.y - 1 : null

    context.setBlockModification(context.x, context.y, context.z, next)
    context.applyBlockChangeToLoadedChunk({ bx: context.x, by: context.y, bz: context.z, next })
    if (otherBy !== null) {
      context.setBlockModification(context.x, otherBy, context.z, next)
      context.applyBlockChangeToLoadedChunk({ bx: context.x, by: otherBy, bz: context.z, next })
    }
    return { handled: true }
  }

  if (context.blockType === 'crafting_table') {
    context.onCraftingTableUse?.()
    return { handled: true }
  }

  return { handled: false }
}

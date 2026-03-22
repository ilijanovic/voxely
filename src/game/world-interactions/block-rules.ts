import type { BlockType } from '../../types'
import { getBlockBreakTimeWithTool, isPlaceableBlock, isReplaceableByPlacement } from '../../block-registry'

/** Supported game modes for block interaction rules. */
export type BlockGameplayMode = 'survival' | 'creative'

/** Java reach values for block breaking by mode. */
const BREAK_REACH_BY_MODE: Record<BlockGameplayMode, number> = {
  survival: 4.5,
  creative: 5,
}

/** Java reach values for placement by mode. */
const PLACE_REACH_BY_MODE: Record<BlockGameplayMode, number> = {
  survival: 4.5,
  creative: 5,
}

/** Placement attempt payload for occupancy checks. */
export interface PlacementCellRuleInput {
  selectedType: BlockType
  selectedCount: number
  occupiedType: BlockType | 'air' | null
}

/** Result of evaluating whether a target cell can be used for placement. */
export interface PlacementCellRuleResult {
  allowed: boolean
  reason?: 'slot_empty' | 'not_placeable' | 'occupied_not_replaceable'
}

/**
 * Returns the effective break reach for the active mode.
 *
 * @param mode - Current game mode
 * @returns Reach in world units
 */
export function getBreakReach(mode: BlockGameplayMode): number {
  return BREAK_REACH_BY_MODE[mode]
}

/**
 * Returns the effective placement reach for the active mode.
 *
 * @param mode - Current game mode
 * @returns Reach in world units
 */
export function getPlaceReach(mode: BlockGameplayMode): number {
  return PLACE_REACH_BY_MODE[mode]
}

/**
 * Returns break duration for one block based on mode and held item.
 *
 * @param blockType - Target block type
 * @param heldItem - Held item id
 * @param mode - Current game mode
 * @returns Break time in seconds
 */
export function getBreakDurationForMode(
  blockType: BlockType,
  heldItem: BlockType | undefined,
  mode: BlockGameplayMode,
): number {
  if (mode === 'creative') return 0
  return getBlockBreakTimeWithTool(blockType, heldItem)
}

/**
 * Validates the selected item against a target placement cell.
 *
 * @param input - Placement context
 * @returns Whether placement is allowed and reason when denied
 */
export function evaluatePlacementCell(input: PlacementCellRuleInput): PlacementCellRuleResult {
  if (input.selectedCount <= 0) return { allowed: false, reason: 'slot_empty' }
  if (!isPlaceableBlock(input.selectedType)) return { allowed: false, reason: 'not_placeable' }

  if (
    input.occupiedType !== null &&
    input.occupiedType !== 'air' &&
    !isReplaceableByPlacement(input.occupiedType)
  ) {
    return { allowed: false, reason: 'occupied_not_replaceable' }
  }
  return { allowed: true }
}

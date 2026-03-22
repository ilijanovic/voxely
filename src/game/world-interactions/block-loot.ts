import type { BlockType } from '../../types'
import { canHarvestBlockForDrops, getBlockDefinition } from '../../block-registry'

/** Minimal enchantment payload used by loot resolution. */
export interface MiningEnchantments {
  silkTouch?: boolean
  fortuneLevel?: number
}

/** Input required to resolve block loot drops. */
export interface BlockLootInput {
  blockType: BlockType
  heldItemId?: string
  enchantments?: MiningEnchantments
}

/** Resolved drop for one break action. */
export interface BlockLootResult {
  dropType: BlockType | null
  count: number
}

const ORE_DROP_BY_BLOCK: Partial<Record<BlockType, BlockType>> = {
  coal_ore: 'coal',
  iron_ore: 'raw_iron',
  gold_ore: 'raw_gold',
  diamond_ore: 'diamond',
  redstone_ore: 'redstone',
  lapis_ore: 'lapis_lazuli',
  emerald_ore: 'emerald',
}

/**
 * Computes additional ore drops for fortune level.
 *
 * @param fortuneLevel - Fortune enchant level
 * @returns Extra items count beyond base drop
 */
function getFortuneBonusCount(fortuneLevel: number): number {
  if (fortuneLevel <= 0) return 0
  const capped = Math.min(3, fortuneLevel)
  return Math.floor(Math.random() * (capped + 1))
}

/**
 * Resolves Minecraft-like drop outcome for a broken block.
 *
 * @param input - Loot context
 * @returns Drop type/count or null when no drop
 */
export function resolveBlockLoot(input: BlockLootInput): BlockLootResult {
  const blockDef = getBlockDefinition(input.blockType)
  const hasRequiredTool = canHarvestBlockForDrops(input.blockType, input.heldItemId)

  if (!hasRequiredTool) {
    return { dropType: null, count: 0 }
  }

  if (input.enchantments?.silkTouch === true) {
    return { dropType: input.blockType, count: 1 }
  }

  const explicitDrop = ORE_DROP_BY_BLOCK[input.blockType]
  if (explicitDrop) {
    const fortuneBonus = getFortuneBonusCount(input.enchantments?.fortuneLevel ?? 0)
    return { dropType: explicitDrop, count: 1 + fortuneBonus }
  }

  const fallbackDrop = (blockDef?.id ?? input.blockType) as BlockType
  return { dropType: fallbackDrop, count: 1 }
}

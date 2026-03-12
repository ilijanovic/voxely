/**
 * Hotbar icon and label lookup: builds BLOCK_ICON and BLOCK_LABEL from the block registry at load time.
 * Used by the HUD, Inventory overlay, block selection UI, and quest reward tooltips.
 */
import type { BlockType } from './types'
import { getBlockTexturePath, getItemTexturePath, WEAPON_BASE_DAMAGE } from './constants'
import {
  getAllBlockIds,
  getBlockDisplayName,
  getBlockTextureNames,
  getItemTextureName,
  getWeaponType,
} from './block-registry'

/** Block type → icon texture URL for the hotbar. Built from registry. */
export const BLOCK_ICON: Record<string, string> = {}
/** Block type → display name (tooltip). Built from registry. */
export const BLOCK_LABEL: Record<string, string> = {}

const blockTexturePath = getBlockTexturePath()
const itemTexturePath = getItemTexturePath()
const defaultIcon = `${blockTexturePath}/stone.png`
const defaultLabel = 'Block'

for (const id of getAllBlockIds()) {
  const itemTex = getItemTextureName(id)
  const names = getBlockTextureNames(id)
  const basePath = itemTex ? itemTexturePath : blockTexturePath
  BLOCK_ICON[id] = names.length > 0 ? `${basePath}/${names[0]}.png` : defaultIcon
  BLOCK_LABEL[id] = getBlockDisplayName(id)
}

/** Get icon URL for a block type (with fallback for unknown ids). */
export function getBlockIcon(blockType: BlockType): string {
  return BLOCK_ICON[blockType] ?? defaultIcon
}

/** Get display name for a block type (with fallback for unknown ids). */
export function getBlockLabel(blockType: BlockType): string {
  return BLOCK_LABEL[blockType] ?? defaultLabel
}

/**
 * Returns stat lines for tooltip (e.g. "Damage: 2" for weapons). Empty array if no stats.
 */
export function getItemStats(itemType: BlockType): string[] {
  const weaponType = getWeaponType(itemType)
  if (weaponType != null) {
    const damage = WEAPON_BASE_DAMAGE[weaponType]
    if (damage != null) return [`Damage: ${damage}`]
  }
  return []
}

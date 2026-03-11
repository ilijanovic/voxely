/**
 * Hotbar icon and label lookup: builds BLOCK_ICON and BLOCK_LABEL from the block registry at load time.
 * Used by the HUD, Inventory overlay, and block selection UI.
 */
import type { BlockType } from './types'
import { getBlockTexturePath } from './constants'
import { getAllBlockIds, getBlockDisplayName, getBlockTextureNames } from './block-registry'

/** Block type → icon texture URL for the hotbar. Built from registry. */
export const BLOCK_ICON: Record<string, string> = {}
/** Block type → display name (tooltip). Built from registry. */
export const BLOCK_LABEL: Record<string, string> = {}

const blockTexturePath = getBlockTexturePath()
const defaultIcon = `${blockTexturePath}/stone.png`
const defaultLabel = 'Block'

for (const id of getAllBlockIds()) {
  const names = getBlockTextureNames(id)
  BLOCK_ICON[id] = names.length > 0 ? `${blockTexturePath}/${names[0]}.png` : defaultIcon
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

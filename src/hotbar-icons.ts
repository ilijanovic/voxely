import type { BlockType } from "./types";
import { BLOCK_TEXTURE_PATH } from "./constants";
import {
  getAllBlockIds,
  getBlockDisplayName,
  getBlockTextureNames,
} from "./block-registry";

/** Block type → icon texture URL for the hotbar. Built from registry. */
export const BLOCK_ICON: Record<string, string> = {};
/** Block type → display name (tooltip). Built from registry. */
export const BLOCK_LABEL: Record<string, string> = {};

const defaultIcon = `${BLOCK_TEXTURE_PATH}/stone.png`;
const defaultLabel = "Block";

for (const id of getAllBlockIds()) {
  const names = getBlockTextureNames(id);
  BLOCK_ICON[id] = names.length > 0
    ? `${BLOCK_TEXTURE_PATH}/${names[0]}.png`
    : defaultIcon;
  BLOCK_LABEL[id] = getBlockDisplayName(id);
}

/** Get icon URL for a block type (with fallback for unknown ids). */
export function getBlockIcon(blockType: BlockType): string {
  return BLOCK_ICON[blockType] ?? defaultIcon;
}

/** Get display name for a block type (with fallback for unknown ids). */
export function getBlockLabel(blockType: BlockType): string {
  return BLOCK_LABEL[blockType] ?? defaultLabel;
}

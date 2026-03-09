import type { BlockType } from "./types";

/** Block type → icon texture for the hotbar. */
export const BLOCK_ICON: Record<BlockType, string> = {
  grass: "/textures/grass_top.png",
  dirt: "/textures/dirt.png",
  stone: "/textures/stone.png",
  sand: "/textures/sand.png",
  snow: "/textures/snow.png",
  wood: "/textures/wood_top.png",
  leaves: "/textures/leaves.png",
  water: "/textures/stone.png",
  torch: "/textures/wood_top.png",
  bedrock: "/textures/stone.png",
};

/** Block type → display name (tooltip). */
export const BLOCK_LABEL: Record<BlockType, string> = {
  grass: "Grass",
  dirt: "Dirt",
  stone: "Stone",
  sand: "Sand",
  snow: "Snow",
  wood: "Wood",
  leaves: "Leaves",
  water: "Water",
  torch: "Torch",
  bedrock: "Bedrock",
};

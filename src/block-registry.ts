/**
 * Block registry: central definitions for all placeable block types.
 * Texture paths are relative to BLOCK_TEXTURE_PATH (e.g. /assets/minecraft/textures/block).
 */

/** Single texture for all 6 faces, or 6 face textures: [right, left, top, bottom, front, back] (BoxGeometry order). */
export type BlockTextures =
  | { type: "single"; texture: string }
  | { type: "six"; textures: [string, string, string, string, string, string] };

export interface BlockDefinition {
  id: string;
  displayName: string;
  textures: BlockTextures;
  solid?: boolean;
  transparent?: boolean;
  unbreakable?: boolean;
}

/** Default: solid true, transparent false, unbreakable false. */
const D = (def: Omit<BlockDefinition, "solid" | "transparent" | "unbreakable"> & Partial<Pick<BlockDefinition, "solid" | "transparent" | "unbreakable">>): BlockDefinition => ({
  solid: true,
  transparent: false,
  unbreakable: false,
  ...def,
});

/** Existing terrain blocks (same texture layout as current game.ts). */
const LEGACY_BLOCKS: BlockDefinition[] = [
  D({
    id: "grass",
    displayName: "Grass Block",
    textures: {
      type: "six",
      textures: ["grass_block_side", "grass_block_side", "grass_block_top", "dirt", "grass_block_side", "grass_block_side"],
    },
  }),
  D({
    id: "grass_snow",
    displayName: "Snowy Grass",
    textures: {
      type: "six",
      textures: ["grass_block_snow", "grass_block_snow", "grass_block_top_snow", "dirt", "grass_block_snow", "grass_block_snow"],
    },
  }),
  D({
    id: "dirt",
    displayName: "Dirt",
    textures: { type: "single", texture: "dirt" },
  }),
  D({
    id: "stone",
    displayName: "Stone",
    textures: { type: "single", texture: "stone" },
  }),
  D({
    id: "sand",
    displayName: "Sand",
    textures: { type: "single", texture: "sand" },
  }),
  D({
    id: "snow",
    displayName: "Snow",
    textures: { type: "single", texture: "snow" },
  }),
  D({
    id: "water",
    displayName: "Water",
    textures: { type: "single", texture: "stone" }, // not used for voxel; material is custom in game.ts
    solid: false,
  }),
  D({
    id: "wood",
    displayName: "Oak Log",
    textures: {
      type: "six",
      textures: ["oak_log", "oak_log", "oak_log_top", "oak_log_top", "oak_log", "oak_log"],
    },
  }),
  D({
    id: "leaves",
    displayName: "Leaves",
    textures: { type: "single", texture: "oak_leaves" },
    transparent: true,
  }),
  D({
    id: "torch",
    displayName: "Torch",
    textures: { type: "single", texture: "oak_log" }, // no voxel; custom mesh in game.ts
    solid: false,
  }),
  D({
    id: "bedrock",
    displayName: "Bedrock",
    textures: { type: "single", texture: "bedrock" },
    unbreakable: true,
  }),
];

/** Curated full-cube blocks (single texture or log-style top/side). */
const CURATED_BLOCKS: BlockDefinition[] = [
  // Nature / stone
  D({ id: "cobblestone", displayName: "Cobblestone", textures: { type: "single", texture: "cobblestone" } }),
  D({ id: "andesite", displayName: "Andesite", textures: { type: "single", texture: "andesite" } }),
  D({ id: "granite", displayName: "Granite", textures: { type: "single", texture: "granite" } }),
  D({ id: "diorite", displayName: "Diorite", textures: { type: "single", texture: "diorite" } }),
  D({ id: "gravel", displayName: "Gravel", textures: { type: "single", texture: "gravel" } }),
  D({ id: "red_sand", displayName: "Red Sand", textures: { type: "single", texture: "red_sand" } }),
  D({ id: "ice", displayName: "Ice", textures: { type: "single", texture: "ice" }, transparent: true }),
  D({ id: "packed_ice", displayName: "Packed Ice", textures: { type: "single", texture: "packed_ice" } }),
  D({ id: "blue_ice", displayName: "Blue Ice", textures: { type: "single", texture: "blue_ice" } }),
  // Building
  D({ id: "bricks", displayName: "Bricks", textures: { type: "single", texture: "bricks" } }),
  D({ id: "stone_bricks", displayName: "Stone Bricks", textures: { type: "single", texture: "stone_bricks" } }),
  D({ id: "mossy_stone_bricks", displayName: "Mossy Stone Bricks", textures: { type: "single", texture: "mossy_stone_bricks" } }),
  D({ id: "sandstone", displayName: "Sandstone", textures: { type: "single", texture: "sandstone" } }),
  D({ id: "quartz_block", displayName: "Block of Quartz", textures: { type: "single", texture: "quartz_block" } }),
  D({ id: "nether_bricks", displayName: "Nether Bricks", textures: { type: "single", texture: "nether_bricks" } }),
  D({ id: "red_nether_bricks", displayName: "Red Nether Bricks", textures: { type: "single", texture: "red_nether_bricks" } }),
  // Planks
  D({ id: "oak_planks", displayName: "Oak Planks", textures: { type: "single", texture: "oak_planks" } }),
  D({ id: "spruce_planks", displayName: "Spruce Planks", textures: { type: "single", texture: "spruce_planks" } }),
  D({ id: "birch_planks", displayName: "Birch Planks", textures: { type: "single", texture: "birch_planks" } }),
  D({ id: "jungle_planks", displayName: "Jungle Planks", textures: { type: "single", texture: "jungle_planks" } }),
  D({ id: "acacia_planks", displayName: "Acacia Planks", textures: { type: "single", texture: "acacia_planks" } }),
  D({ id: "dark_oak_planks", displayName: "Dark Oak Planks", textures: { type: "single", texture: "dark_oak_planks" } }),
  // Logs (side + top)
  D({
    id: "spruce_log",
    displayName: "Spruce Log",
    textures: { type: "six", textures: ["spruce_log", "spruce_log", "spruce_log_top", "spruce_log_top", "spruce_log", "spruce_log"] },
  }),
  D({
    id: "birch_log",
    displayName: "Birch Log",
    textures: { type: "six", textures: ["birch_log", "birch_log", "birch_log_top", "birch_log_top", "birch_log", "birch_log"] },
  }),
  D({
    id: "jungle_log",
    displayName: "Jungle Log",
    textures: { type: "six", textures: ["jungle_log", "jungle_log", "jungle_log_top", "jungle_log_top", "jungle_log", "jungle_log"] },
  }),
  D({
    id: "acacia_log",
    displayName: "Acacia Log",
    textures: { type: "six", textures: ["acacia_log", "acacia_log", "acacia_log_top", "acacia_log_top", "acacia_log", "acacia_log"] },
  }),
  D({
    id: "dark_oak_log",
    displayName: "Dark Oak Log",
    textures: { type: "six", textures: ["dark_oak_log", "dark_oak_log", "dark_oak_log_top", "dark_oak_log_top", "dark_oak_log", "dark_oak_log"] },
  }),
  // Leaves
  D({ id: "oak_leaves", displayName: "Oak Leaves", textures: { type: "single", texture: "oak_leaves" }, transparent: true }),
  D({ id: "birch_leaves", displayName: "Birch Leaves", textures: { type: "single", texture: "birch_leaves" }, transparent: true }),
  D({ id: "spruce_leaves", displayName: "Spruce Leaves", textures: { type: "single", texture: "spruce_leaves" }, transparent: true }),
  // Ores / precious
  D({ id: "coal_block", displayName: "Block of Coal", textures: { type: "single", texture: "coal_block" } }),
  D({ id: "iron_block", displayName: "Block of Iron", textures: { type: "single", texture: "iron_block" } }),
  D({ id: "gold_block", displayName: "Block of Gold", textures: { type: "single", texture: "gold_block" } }),
  D({ id: "diamond_block", displayName: "Block of Diamond", textures: { type: "single", texture: "diamond_block" } }),
  D({ id: "lapis_block", displayName: "Block of Lapis Lazuli", textures: { type: "single", texture: "lapis_block" } }),
  // Decoration
  D({ id: "bookshelf", displayName: "Bookshelf", textures: { type: "single", texture: "bookshelf" } }),
  D({ id: "hay_block", displayName: "Hay Block", textures: { type: "single", texture: "hay_block_side" } }),
  D({ id: "white_wool", displayName: "White Wool", textures: { type: "single", texture: "white_wool" } }),
  D({ id: "black_wool", displayName: "Black Wool", textures: { type: "single", texture: "black_wool" } }),
  D({ id: "red_wool", displayName: "Red Wool", textures: { type: "single", texture: "red_wool" } }),
  D({ id: "orange_wool", displayName: "Orange Wool", textures: { type: "single", texture: "orange_wool" } }),
  D({ id: "blue_wool", displayName: "Blue Wool", textures: { type: "single", texture: "blue_wool" } }),
  D({ id: "green_wool", displayName: "Green Wool", textures: { type: "single", texture: "green_wool" } }),
  D({ id: "yellow_wool", displayName: "Yellow Wool", textures: { type: "single", texture: "yellow_wool" } }),
  D({ id: "brown_wool", displayName: "Brown Wool", textures: { type: "single", texture: "brown_wool" } }),
  D({ id: "gray_wool", displayName: "Gray Wool", textures: { type: "single", texture: "gray_wool" } }),
  D({ id: "light_blue_wool", displayName: "Light Blue Wool", textures: { type: "single", texture: "light_blue_wool" } }),
  D({ id: "lime_wool", displayName: "Lime Wool", textures: { type: "single", texture: "lime_wool" } }),
  D({ id: "magenta_wool", displayName: "Magenta Wool", textures: { type: "single", texture: "magenta_wool" } }),
  D({ id: "pink_wool", displayName: "Pink Wool", textures: { type: "single", texture: "pink_wool" } }),
  D({ id: "purple_wool", displayName: "Purple Wool", textures: { type: "single", texture: "purple_wool" } }),
  D({ id: "cyan_wool", displayName: "Cyan Wool", textures: { type: "single", texture: "cyan_wool" } }),
  D({ id: "light_gray_wool", displayName: "Light Gray Wool", textures: { type: "single", texture: "light_gray_wool" } }),
];

const REGISTRY = new Map<string, BlockDefinition>();
for (const def of [...LEGACY_BLOCKS, ...CURATED_BLOCKS]) {
  REGISTRY.set(def.id, def);
}

export function getBlockDefinition(id: string): BlockDefinition | undefined {
  return REGISTRY.get(id);
}

export function getAllBlockIds(): string[] {
  return Array.from(REGISTRY.keys());
}

/** Block IDs that can be placed from hotbar (solid voxel blocks; excludes water/torch for placement logic). */
export function getPlaceableBlockIds(): string[] {
  return getAllBlockIds().filter((id) => {
    const def = REGISTRY.get(id)!;
    return def.solid !== false || id === "torch"; // torch is placeable but not solid
  });
}

export function isSolidBlock(id: string): boolean {
  const def = REGISTRY.get(id);
  return def ? (def.solid !== false) : false;
}

export function isUnbreakableBlock(id: string): boolean {
  const def = REGISTRY.get(id);
  return def ? (def.unbreakable === true) : false;
}

export function getBlockDisplayName(id: string): string {
  const def = REGISTRY.get(id);
  return def ? def.displayName : id;
}

/** Texture file names (without .png) for loading. Single block returns 1; six-face returns 6. */
export function getBlockTextureNames(id: string): string[] {
  const def = REGISTRY.get(id);
  if (!def) return [];
  if (def.textures.type === "single") return [def.textures.texture];
  return [...def.textures.textures];
}

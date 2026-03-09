/**
 * Block registry: central definitions for all placeable block types.
 * Texture paths are relative to the block texture base path (see getBlockTexturePath() in constants.ts).
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
const D = (
  def: Omit<BlockDefinition, "solid" | "transparent" | "unbreakable"> &
    Partial<Pick<BlockDefinition, "solid" | "transparent" | "unbreakable">>
): BlockDefinition => ({
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
      textures: [
        "grass_side",
        "grass_side",
        "grass_top",
        "dirt",
        "grass_side",
        "grass_side",
      ],
    },
  }),
  D({
    id: "grass_snow",
    displayName: "Snowy Grass",
    textures: {
      type: "six",
      textures: [
        "grass_side_snowed",
        "grass_side_snowed",
        "snow",
        "dirt",
        "grass_side_snowed",
        "grass_side_snowed",
      ],
    },
  }),
  D({
    id: "grass_savanna",
    displayName: "Savanna Grass",
    textures: {
      type: "six",
      textures: [
        "grass_side",
        "grass_side",
        "grass_top",
        "dirt",
        "grass_side",
        "grass_side",
      ],
    },
  }),
  D({
    id: "grass_path",
    displayName: "Grass Path",
    textures: {
      type: "six",
      textures: [
        "grass_path_side",
        "grass_path_side",
        "grass_path_top",
        "dirt",
        "grass_path_side",
        "grass_path_side",
      ],
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
      textures: [
        "log_oak",
        "log_oak",
        "log_oak_top",
        "log_oak_top",
        "log_oak",
        "log_oak",
      ],
    },
  }),
  D({
    id: "leaves",
    displayName: "Leaves",
    textures: { type: "single", texture: "leaves_oak" },
    transparent: true,
  }),
  D({
    id: "torch",
    displayName: "Torch",
    textures: { type: "single", texture: "log_oak" }, // no voxel; custom mesh in game.ts
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
  D({
    id: "cobblestone",
    displayName: "Cobblestone",
    textures: { type: "single", texture: "cobblestone" },
  }),
  D({
    id: "andesite",
    displayName: "Andesite",
    textures: { type: "single", texture: "stone_andesite" },
  }),
  D({
    id: "granite",
    displayName: "Granite",
    textures: { type: "single", texture: "stone_granite" },
  }),
  D({
    id: "diorite",
    displayName: "Diorite",
    textures: { type: "single", texture: "stone_diorite" },
  }),
  D({
    id: "gravel",
    displayName: "Gravel",
    textures: { type: "single", texture: "gravel" },
  }),
  D({
    id: "red_sand",
    displayName: "Red Sand",
    textures: { type: "single", texture: "red_sand" },
  }),
  D({
    id: "ice",
    displayName: "Ice",
    textures: { type: "single", texture: "ice" },
    transparent: true,
  }),
  D({
    id: "packed_ice",
    displayName: "Packed Ice",
    textures: { type: "single", texture: "ice_packed" },
  }),
  D({
    id: "blue_ice",
    displayName: "Blue Ice",
    textures: { type: "single", texture: "ice_packed" },
  }),
  // Building
  D({
    id: "bricks",
    displayName: "Bricks",
    textures: { type: "single", texture: "brick" },
  }),
  D({
    id: "stone_bricks",
    displayName: "Stone Bricks",
    textures: { type: "single", texture: "stonebrick" },
  }),
  D({
    id: "mossy_stone_bricks",
    displayName: "Mossy Stone Bricks",
    textures: { type: "single", texture: "stonebrick_mossy" },
  }),
  D({
    id: "sandstone",
    displayName: "Sandstone",
    textures: { type: "single", texture: "sandstone_normal" },
  }),
  D({
    id: "quartz_block",
    displayName: "Block of Quartz",
    textures: { type: "single", texture: "quartz_block_side" },
  }),
  D({
    id: "nether_bricks",
    displayName: "Nether Bricks",
    textures: { type: "single", texture: "nether_brick" },
  }),
  D({
    id: "red_nether_bricks",
    displayName: "Red Nether Bricks",
    textures: { type: "single", texture: "red_nether_brick" },
  }),
  // Planks
  D({
    id: "oak_planks",
    displayName: "Oak Planks",
    textures: { type: "single", texture: "planks_oak" },
  }),
  D({
    id: "spruce_planks",
    displayName: "Spruce Planks",
    textures: { type: "single", texture: "planks_spruce" },
  }),
  D({
    id: "birch_planks",
    displayName: "Birch Planks",
    textures: { type: "single", texture: "planks_birch" },
  }),
  D({
    id: "jungle_planks",
    displayName: "Jungle Planks",
    textures: { type: "single", texture: "planks_jungle" },
  }),
  D({
    id: "acacia_planks",
    displayName: "Acacia Planks",
    textures: { type: "single", texture: "planks_acacia" },
  }),
  D({
    id: "dark_oak_planks",
    displayName: "Dark Oak Planks",
    textures: { type: "single", texture: "planks_big_oak" },
  }),
  // Logs (side + top)
  D({
    id: "spruce_log",
    displayName: "Spruce Log",
    textures: {
      type: "six",
      textures: [
        "log_spruce",
        "log_spruce",
        "log_spruce_top",
        "log_spruce_top",
        "log_spruce",
        "log_spruce",
      ],
    },
  }),
  D({
    id: "birch_log",
    displayName: "Birch Log",
    textures: {
      type: "six",
      textures: [
        "log_birch",
        "log_birch",
        "log_birch_top",
        "log_birch_top",
        "log_birch",
        "log_birch",
      ],
    },
  }),
  D({
    id: "jungle_log",
    displayName: "Jungle Log",
    textures: {
      type: "six",
      textures: [
        "log_jungle",
        "log_jungle",
        "log_jungle_top",
        "log_jungle_top",
        "log_jungle",
        "log_jungle",
      ],
    },
  }),
  D({
    id: "acacia_log",
    displayName: "Acacia Log",
    textures: {
      type: "six",
      textures: [
        "log_acacia",
        "log_acacia",
        "log_acacia_top",
        "log_acacia_top",
        "log_acacia",
        "log_acacia",
      ],
    },
  }),
  D({
    id: "dark_oak_log",
    displayName: "Dark Oak Log",
    textures: {
      type: "six",
      textures: [
        "log_big_oak",
        "log_big_oak",
        "log_big_oak_top",
        "log_big_oak_top",
        "log_big_oak",
        "log_big_oak",
      ],
    },
  }),
  // Leaves
  D({
    id: "oak_leaves",
    displayName: "Oak Leaves",
    textures: { type: "single", texture: "leaves_oak" },
    transparent: true,
  }),
  D({
    id: "birch_leaves",
    displayName: "Birch Leaves",
    textures: { type: "single", texture: "leaves_birch" },
    transparent: true,
  }),
  D({
    id: "spruce_leaves",
    displayName: "Spruce Leaves",
    textures: { type: "single", texture: "leaves_spruce" },
    transparent: true,
  }),
  // Ores / precious
  D({
    id: "coal_block",
    displayName: "Block of Coal",
    textures: { type: "single", texture: "coal_block" },
  }),
  D({
    id: "iron_block",
    displayName: "Block of Iron",
    textures: { type: "single", texture: "iron_block" },
  }),
  D({
    id: "gold_block",
    displayName: "Block of Gold",
    textures: { type: "single", texture: "gold_block" },
  }),
  D({
    id: "diamond_block",
    displayName: "Block of Diamond",
    textures: { type: "single", texture: "diamond_block" },
  }),
  D({
    id: "lapis_block",
    displayName: "Block of Lapis Lazuli",
    textures: { type: "single", texture: "lapis_block" },
  }),
  // Decoration
  D({
    id: "bookshelf",
    displayName: "Bookshelf",
    textures: { type: "single", texture: "bookshelf" },
  }),
  D({
    id: "hay_block",
    displayName: "Hay Block",
    textures: { type: "single", texture: "hay_block_side" },
  }),
  D({
    id: "white_wool",
    displayName: "White Wool",
    textures: { type: "single", texture: "wool_colored_white" },
  }),
  D({
    id: "black_wool",
    displayName: "Black Wool",
    textures: { type: "single", texture: "wool_colored_black" },
  }),
  D({
    id: "red_wool",
    displayName: "Red Wool",
    textures: { type: "single", texture: "wool_colored_red" },
  }),
  D({
    id: "orange_wool",
    displayName: "Orange Wool",
    textures: { type: "single", texture: "wool_colored_orange" },
  }),
  D({
    id: "blue_wool",
    displayName: "Blue Wool",
    textures: { type: "single", texture: "wool_colored_blue" },
  }),
  D({
    id: "green_wool",
    displayName: "Green Wool",
    textures: { type: "single", texture: "wool_colored_green" },
  }),
  D({
    id: "yellow_wool",
    displayName: "Yellow Wool",
    textures: { type: "single", texture: "wool_colored_yellow" },
  }),
  D({
    id: "brown_wool",
    displayName: "Brown Wool",
    textures: { type: "single", texture: "wool_colored_brown" },
  }),
  D({
    id: "gray_wool",
    displayName: "Gray Wool",
    textures: { type: "single", texture: "wool_colored_gray" },
  }),
  D({
    id: "light_blue_wool",
    displayName: "Light Blue Wool",
    textures: { type: "single", texture: "wool_colored_light_blue" },
  }),
  D({
    id: "lime_wool",
    displayName: "Lime Wool",
    textures: { type: "single", texture: "wool_colored_lime" },
  }),
  D({
    id: "magenta_wool",
    displayName: "Magenta Wool",
    textures: { type: "single", texture: "wool_colored_magenta" },
  }),
  D({
    id: "pink_wool",
    displayName: "Pink Wool",
    textures: { type: "single", texture: "wool_colored_pink" },
  }),
  D({
    id: "purple_wool",
    displayName: "Purple Wool",
    textures: { type: "single", texture: "wool_colored_purple" },
  }),
  D({
    id: "cyan_wool",
    displayName: "Cyan Wool",
    textures: { type: "single", texture: "wool_colored_cyan" },
  }),
  D({
    id: "light_gray_wool",
    displayName: "Light Gray Wool",
    textures: { type: "single", texture: "wool_colored_silver" },
  }),
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
  return def ? def.solid !== false : false;
}

export function isUnbreakableBlock(id: string): boolean {
  const def = REGISTRY.get(id);
  return def ? def.unbreakable === true : false;
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

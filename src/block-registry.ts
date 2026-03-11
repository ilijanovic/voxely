/**
 * Block registry: central definitions for all placeable block types.
 * Texture paths are relative to the block texture base path (see getBlockTexturePath() in constants.ts).
 */

/** Single texture for all 6 faces, or 6 face textures: [right, left, top, bottom, front, back] (BoxGeometry order). */
export type BlockTextures =
  | { type: 'single'; texture: string }
  | { type: 'six'; textures: [string, string, string, string, string, string] }

/** Default break time in seconds when not specified. */
const DEFAULT_BREAK_TIME_SECONDS = 1.0

/** Fluid kind for flow/source logic; non-fluids omit this. */
export type BlockFluidKind = 'water'

export interface BlockDefinition {
  id: string
  displayName: string
  textures: BlockTextures
  /** Collision and raycast: block occupies space. Default true. */
  solid?: boolean
  /** Rendering: alpha cutout / translucent. Default false. */
  transparent?: boolean
  /** Cannot be broken by player (e.g. bedrock). Default false. */
  unbreakable?: boolean
  /** Can be selected from hotbar and placed in world. Default: true when solid, false for non-solid unless set. */
  placeable?: boolean
  /** Face culling: block hides adjacent block faces (opaque). Default: same as solid. Set false for leaves, ice, glass. */
  occludes?: boolean
  /** When set, block is a fluid (source + flowing levels). Used for flow logic and height. */
  fluid?: BlockFluidKind
  /** Seconds of holding to break; 0 = instant (one "hit"). Omitted => DEFAULT_BREAK_TIME_SECONDS. */
  breakTimeSeconds?: number
  /** When set, this is a held item (e.g. weapon/tool); texture name under item texture path for icon and first-person display. */
  itemTexture?: string
  /** Cross geometry (e.g. flowers, fern); material should use DoubleSide. Default false. */
  crossGeometry?: boolean
  /** Skip normal map for terrain-style blocks. Default false. */
  skipNormalMap?: boolean
  /** Skip specular map (e.g. grass blocks using colormap). Default false. */
  skipSpecularMap?: boolean
  /** Height in world units for fluid source blocks (e.g. 1 for full water). Omitted for non-fluids and flowing variants. */
  fluidHeight?: number
}

/** Default: solid true, transparent false, unbreakable false, placeable/occludes derived from solid. */
const D = (
  def: Omit<BlockDefinition, 'solid' | 'transparent' | 'unbreakable' | 'placeable' | 'occludes'> &
    Partial<
      Pick<
        BlockDefinition,
        | 'solid'
        | 'transparent'
        | 'unbreakable'
        | 'placeable'
        | 'occludes'
        | 'breakTimeSeconds'
        | 'fluid'
        | 'crossGeometry'
        | 'skipNormalMap'
        | 'skipSpecularMap'
        | 'fluidHeight'
      >
    >,
): BlockDefinition => {
  const solid = def.solid !== false
  return {
    solid: true,
    transparent: false,
    unbreakable: false,
    ...def,
    placeable: def.placeable ?? solid,
    occludes: def.occludes ?? solid,
  }
}

/** Existing terrain blocks (same texture layout as current game.ts). */
const LEGACY_BLOCKS: BlockDefinition[] = [
  D({
    id: 'grass',
    displayName: 'Grass Block',
    textures: {
      type: 'six',
      textures: ['grass_side', 'grass_side', 'grass_top', 'dirt', 'grass_side', 'grass_side'],
    },
    breakTimeSeconds: 0.5,
    skipNormalMap: true,
    skipSpecularMap: true,
  }),
  D({
    id: 'grass_snow',
    displayName: 'Snowy Grass',
    textures: {
      type: 'six',
      textures: [
        'grass_side_snowed',
        'grass_side_snowed',
        'snow',
        'dirt',
        'grass_side_snowed',
        'grass_side_snowed',
      ],
    },
    breakTimeSeconds: 0.5,
    skipNormalMap: true,
  }),
  D({
    id: 'grass_savanna',
    displayName: 'Savanna Grass',
    textures: {
      type: 'six',
      textures: ['grass_side', 'grass_side', 'grass_top', 'dirt', 'grass_side', 'grass_side'],
    },
    breakTimeSeconds: 0.5,
    skipNormalMap: true,
    skipSpecularMap: true,
  }),
  D({
    id: 'grass_path',
    displayName: 'Grass Path',
    textures: {
      type: 'six',
      textures: [
        'grass_path_side',
        'grass_path_side',
        'grass_path_top',
        'dirt',
        'grass_path_side',
        'grass_path_side',
      ],
    },
    breakTimeSeconds: 0.5,
  }),
  D({
    id: 'dirt',
    displayName: 'Dirt',
    textures: { type: 'single', texture: 'dirt' },
    breakTimeSeconds: 0.5,
    skipNormalMap: true,
  }),
  D({
    id: 'stone',
    displayName: 'Stone',
    textures: { type: 'single', texture: 'stone' },
    breakTimeSeconds: 1.5,
    skipNormalMap: true,
  }),
  D({
    id: 'sand',
    displayName: 'Sand',
    textures: { type: 'single', texture: 'sand' },
    breakTimeSeconds: 0.5,
    skipNormalMap: true,
  }),
  D({
    id: 'snow',
    displayName: 'Snow',
    textures: { type: 'single', texture: 'snow' },
    breakTimeSeconds: 0.5,
    skipNormalMap: true,
  }),
  ...([1, 2, 3, 4, 5, 6, 7, 8] as const).map((k) =>
    D({
      id: `snow_layer_${k}` as const,
      displayName: 'Snow Layer',
      textures: { type: 'single', texture: 'snow' },
      breakTimeSeconds: 0.5,
    }),
  ),
  D({
    id: 'water',
    displayName: 'Water',
    textures: { type: 'single', texture: 'stone' }, // not used for voxel; material is custom in game.ts
    solid: false,
    placeable: true,
    occludes: false,
    fluid: 'water',
  }),
  // Flowing water block types (water_source + water_flowing_1..7) for simulation and rendering
  D({
    id: 'water_source',
    displayName: 'Water (Source)',
    textures: { type: 'single', texture: 'stone' },
    solid: false,
    placeable: false,
    occludes: false,
    fluid: 'water',
    fluidHeight: 1,
  }),
  ...([1, 2, 3, 4, 5, 6, 7] as const).map((k) =>
    D({
      id: `water_flowing_${k}` as const,
      displayName: 'Water (Flowing)',
      textures: { type: 'single', texture: 'stone' },
      solid: false,
      placeable: false,
      occludes: false,
      fluid: 'water',
    }),
  ),
  D({
    id: 'wood',
    displayName: 'Oak Log',
    textures: {
      type: 'six',
      textures: ['log_oak', 'log_oak', 'log_oak_top', 'log_oak_top', 'log_oak', 'log_oak'],
    },
    breakTimeSeconds: 1.5,
  }),
  D({
    id: 'leaves',
    displayName: 'Leaves',
    textures: { type: 'single', texture: 'leaves_oak' },
    transparent: true,
    occludes: false,
    breakTimeSeconds: 0.5,
  }),
  D({
    id: 'torch',
    displayName: 'Torch',
    textures: { type: 'single', texture: 'log_oak' }, // no voxel; custom mesh in game.ts
    solid: false,
    placeable: true,
    occludes: false,
  }),
  D({
    id: 'bedrock',
    displayName: 'Bedrock',
    textures: { type: 'single', texture: 'bedrock' },
    unbreakable: true,
    skipNormalMap: true,
  }),
]

/** Curated full-cube blocks (single texture or log-style top/side). */
const CURATED_BLOCKS: BlockDefinition[] = [
  // Nature / stone
  D({
    id: 'cobblestone',
    displayName: 'Cobblestone',
    textures: { type: 'single', texture: 'cobblestone' },
    breakTimeSeconds: 1.5,
  }),
  D({
    id: 'andesite',
    displayName: 'Andesite',
    textures: { type: 'single', texture: 'stone_andesite' },
    breakTimeSeconds: 1.5,
  }),
  D({
    id: 'granite',
    displayName: 'Granite',
    textures: { type: 'single', texture: 'stone_granite' },
    breakTimeSeconds: 1.5,
  }),
  D({
    id: 'diorite',
    displayName: 'Diorite',
    textures: { type: 'single', texture: 'stone_diorite' },
    breakTimeSeconds: 1.5,
  }),
  D({
    id: 'gravel',
    displayName: 'Gravel',
    textures: { type: 'single', texture: 'gravel' },
    breakTimeSeconds: 0.5,
  }),
  D({
    id: 'red_sand',
    displayName: 'Red Sand',
    textures: { type: 'single', texture: 'red_sand' },
    breakTimeSeconds: 0.5,
  }),
  D({
    id: 'mycelium',
    displayName: 'Mycelium',
    textures: {
      type: 'six',
      textures: [
        'mycelium_side',
        'mycelium_side',
        'mycelium_top',
        'dirt',
        'mycelium_side',
        'mycelium_side',
      ],
    },
    breakTimeSeconds: 0.5,
    skipNormalMap: true,
  }),
  D({
    id: 'podzol',
    displayName: 'Podzol',
    textures: {
      type: 'six',
      textures: [
        'dirt_podzol_side',
        'dirt_podzol_side',
        'dirt_podzol_top',
        'dirt',
        'dirt_podzol_side',
        'dirt_podzol_side',
      ],
    },
    breakTimeSeconds: 0.5,
    skipNormalMap: true,
  }),
  D({
    id: 'mud',
    displayName: 'Mud',
    textures: { type: 'single', texture: 'dirt' },
    breakTimeSeconds: 0.5,
    skipNormalMap: true,
  }),
  D({
    id: 'coarse_dirt',
    displayName: 'Coarse Dirt',
    textures: { type: 'single', texture: 'coarse_dirt' },
    breakTimeSeconds: 0.5,
    skipNormalMap: true,
  }),
  D({
    id: 'ice',
    displayName: 'Ice',
    textures: { type: 'single', texture: 'ice' },
    transparent: true,
    occludes: false,
  }),
  D({
    id: 'packed_ice',
    displayName: 'Packed Ice',
    textures: { type: 'single', texture: 'ice_packed' },
    occludes: false,
  }),
  D({
    id: 'blue_ice',
    displayName: 'Blue Ice',
    textures: { type: 'single', texture: 'ice_packed' },
    occludes: false,
  }),
  // Building
  D({
    id: 'bricks',
    displayName: 'Bricks',
    textures: { type: 'single', texture: 'brick' },
    breakTimeSeconds: 2,
  }),
  D({
    id: 'stone_bricks',
    displayName: 'Stone Bricks',
    textures: { type: 'single', texture: 'stonebrick' },
    breakTimeSeconds: 2,
  }),
  D({
    id: 'mossy_stone_bricks',
    displayName: 'Mossy Stone Bricks',
    textures: { type: 'single', texture: 'stonebrick_mossy' },
    breakTimeSeconds: 2,
  }),
  D({
    id: 'sandstone',
    displayName: 'Sandstone',
    textures: { type: 'single', texture: 'sandstone_normal' },
  }),
  D({
    id: 'dead_bush',
    displayName: 'Dead Bush',
    textures: { type: 'single', texture: 'deadbush' },
    solid: false,
    breakTimeSeconds: 0,
  }),
  D({
    id: 'cactus',
    displayName: 'Cactus',
    textures: {
      type: 'six',
      textures: [
        'cactus_side',
        'cactus_side',
        'cactus_top',
        'cactus_bottom',
        'cactus_side',
        'cactus_side',
      ],
    },
  }),
  // Feature blocks (flowers, ground cover) – cross geometry in chunk-apply; alpha cutout + double-side
  D({
    id: 'dandelion',
    displayName: 'Dandelion',
    textures: { type: 'single', texture: 'flower_dandelion' },
    solid: false,
    transparent: true,
    breakTimeSeconds: 0,
    crossGeometry: true,
  }),
  D({
    id: 'poppy',
    displayName: 'Poppy',
    textures: { type: 'single', texture: 'flower_rose' },
    solid: false,
    transparent: true,
    breakTimeSeconds: 0,
    crossGeometry: true,
  }),
  D({
    id: 'tulip_red',
    displayName: 'Red Tulip',
    textures: { type: 'single', texture: 'flower_tulip_red' },
    solid: false,
    transparent: true,
    breakTimeSeconds: 0,
    crossGeometry: true,
  }),
  D({
    id: 'oxeye_daisy',
    displayName: 'Oxeye Daisy',
    textures: { type: 'single', texture: 'flower_oxeye_daisy' },
    solid: false,
    transparent: true,
    breakTimeSeconds: 0,
    crossGeometry: true,
  }),
  D({
    id: 'blue_orchid',
    displayName: 'Blue Orchid',
    textures: { type: 'single', texture: 'flower_blue_orchid' },
    solid: false,
    transparent: true,
    breakTimeSeconds: 0,
    crossGeometry: true,
  }),
  D({
    id: 'tall_grass',
    displayName: 'Tall Grass',
    textures: { type: 'single', texture: 'tallgrass' },
    solid: false,
    transparent: true,
    crossGeometry: true,
    breakTimeSeconds: 0,
  }),
  D({
    id: 'fern',
    displayName: 'Fern',
    textures: { type: 'single', texture: 'fern' },
    solid: false,
    transparent: true,
    breakTimeSeconds: 0,
    crossGeometry: true,
  }),
  D({
    id: 'quartz_block',
    displayName: 'Block of Quartz',
    textures: { type: 'single', texture: 'quartz_block_side' },
  }),
  D({
    id: 'nether_bricks',
    displayName: 'Nether Bricks',
    textures: { type: 'single', texture: 'nether_brick' },
  }),
  D({
    id: 'red_nether_bricks',
    displayName: 'Red Nether Bricks',
    textures: { type: 'single', texture: 'red_nether_brick' },
  }),
  // Planks
  D({
    id: 'oak_planks',
    displayName: 'Oak Planks',
    textures: { type: 'single', texture: 'planks_oak' },
  }),
  D({
    id: 'door_closed',
    displayName: 'Door (closed)',
    textures: { type: 'single', texture: 'planks_oak' },
  }),
  D({
    id: 'door_open',
    displayName: 'Door (open)',
    textures: { type: 'single', texture: 'planks_oak' },
    solid: false,
    placeable: false, // only closed door is placed; open state is runtime
    occludes: false,
  }),
  D({
    id: 'spruce_planks',
    displayName: 'Spruce Planks',
    textures: { type: 'single', texture: 'planks_spruce' },
  }),
  D({
    id: 'birch_planks',
    displayName: 'Birch Planks',
    textures: { type: 'single', texture: 'planks_birch' },
  }),
  D({
    id: 'jungle_planks',
    displayName: 'Jungle Planks',
    textures: { type: 'single', texture: 'planks_jungle' },
  }),
  D({
    id: 'acacia_planks',
    displayName: 'Acacia Planks',
    textures: { type: 'single', texture: 'planks_acacia' },
  }),
  D({
    id: 'dark_oak_planks',
    displayName: 'Dark Oak Planks',
    textures: { type: 'single', texture: 'planks_big_oak' },
  }),
  // Logs (side + top)
  D({
    id: 'spruce_log',
    displayName: 'Spruce Log',
    textures: {
      type: 'six',
      textures: [
        'log_spruce',
        'log_spruce',
        'log_spruce_top',
        'log_spruce_top',
        'log_spruce',
        'log_spruce',
      ],
    },
  }),
  D({
    id: 'birch_log',
    displayName: 'Birch Log',
    textures: {
      type: 'six',
      textures: [
        'log_birch',
        'log_birch',
        'log_birch_top',
        'log_birch_top',
        'log_birch',
        'log_birch',
      ],
    },
  }),
  D({
    id: 'jungle_log',
    displayName: 'Jungle Log',
    textures: {
      type: 'six',
      textures: [
        'log_jungle',
        'log_jungle',
        'log_jungle_top',
        'log_jungle_top',
        'log_jungle',
        'log_jungle',
      ],
    },
  }),
  D({
    id: 'acacia_log',
    displayName: 'Acacia Log',
    textures: {
      type: 'six',
      textures: [
        'log_acacia',
        'log_acacia',
        'log_acacia_top',
        'log_acacia_top',
        'log_acacia',
        'log_acacia',
      ],
    },
  }),
  D({
    id: 'dark_oak_log',
    displayName: 'Dark Oak Log',
    textures: {
      type: 'six',
      textures: [
        'log_big_oak',
        'log_big_oak',
        'log_big_oak_top',
        'log_big_oak_top',
        'log_big_oak',
        'log_big_oak',
      ],
    },
  }),
  // Leaves
  D({
    id: 'oak_leaves',
    displayName: 'Oak Leaves',
    textures: { type: 'single', texture: 'leaves_oak' },
    transparent: true,
    occludes: false,
  }),
  D({
    id: 'birch_leaves',
    displayName: 'Birch Leaves',
    textures: { type: 'single', texture: 'leaves_birch' },
    transparent: true,
    occludes: false,
  }),
  D({
    id: 'spruce_leaves',
    displayName: 'Spruce Leaves',
    textures: { type: 'single', texture: 'leaves_spruce' },
    transparent: true,
    occludes: false,
  }),
  // Ores / precious
  D({
    id: 'coal_block',
    displayName: 'Block of Coal',
    textures: { type: 'single', texture: 'coal_block' },
  }),
  D({
    id: 'iron_block',
    displayName: 'Block of Iron',
    textures: { type: 'single', texture: 'iron_block' },
  }),
  D({
    id: 'gold_block',
    displayName: 'Block of Gold',
    textures: { type: 'single', texture: 'gold_block' },
  }),
  D({
    id: 'diamond_block',
    displayName: 'Block of Diamond',
    textures: { type: 'single', texture: 'diamond_block' },
  }),
  D({
    id: 'lapis_block',
    displayName: 'Block of Lapis Lazuli',
    textures: { type: 'single', texture: 'lapis_block' },
  }),
  // Decoration
  D({
    id: 'bookshelf',
    displayName: 'Bookshelf',
    textures: { type: 'single', texture: 'bookshelf' },
  }),
  D({
    id: 'hay_block',
    displayName: 'Hay Block',
    textures: { type: 'single', texture: 'hay_block_side' },
  }),
  ...([1, 2, 3, 4, 5, 6, 7, 8] as const).map((k) =>
    D({
      id: `wheat_${k}` as const,
      displayName: k === 8 ? 'Wheat (ripe)' : 'Wheat',
      textures: { type: 'single', texture: `wheat_stage_${k - 1}` },
      solid: false,
    }),
  ),
  D({
    id: 'white_wool',
    displayName: 'White Wool',
    textures: { type: 'single', texture: 'wool_colored_white' },
  }),
  D({
    id: 'black_wool',
    displayName: 'Black Wool',
    textures: { type: 'single', texture: 'wool_colored_black' },
  }),
  D({
    id: 'red_wool',
    displayName: 'Red Wool',
    textures: { type: 'single', texture: 'wool_colored_red' },
  }),
  D({
    id: 'orange_wool',
    displayName: 'Orange Wool',
    textures: { type: 'single', texture: 'wool_colored_orange' },
  }),
  D({
    id: 'blue_wool',
    displayName: 'Blue Wool',
    textures: { type: 'single', texture: 'wool_colored_blue' },
  }),
  D({
    id: 'green_wool',
    displayName: 'Green Wool',
    textures: { type: 'single', texture: 'wool_colored_green' },
  }),
  D({
    id: 'yellow_wool',
    displayName: 'Yellow Wool',
    textures: { type: 'single', texture: 'wool_colored_yellow' },
  }),
  D({
    id: 'brown_wool',
    displayName: 'Brown Wool',
    textures: { type: 'single', texture: 'wool_colored_brown' },
  }),
  D({
    id: 'gray_wool',
    displayName: 'Gray Wool',
    textures: { type: 'single', texture: 'wool_colored_gray' },
  }),
  D({
    id: 'light_blue_wool',
    displayName: 'Light Blue Wool',
    textures: { type: 'single', texture: 'wool_colored_light_blue' },
  }),
  D({
    id: 'lime_wool',
    displayName: 'Lime Wool',
    textures: { type: 'single', texture: 'wool_colored_lime' },
  }),
  D({
    id: 'magenta_wool',
    displayName: 'Magenta Wool',
    textures: { type: 'single', texture: 'wool_colored_magenta' },
  }),
  D({
    id: 'pink_wool',
    displayName: 'Pink Wool',
    textures: { type: 'single', texture: 'wool_colored_pink' },
  }),
  D({
    id: 'purple_wool',
    displayName: 'Purple Wool',
    textures: { type: 'single', texture: 'wool_colored_purple' },
  }),
  D({
    id: 'cyan_wool',
    displayName: 'Cyan Wool',
    textures: { type: 'single', texture: 'wool_colored_cyan' },
  }),
  D({
    id: 'light_gray_wool',
    displayName: 'Light Gray Wool',
    textures: { type: 'single', texture: 'wool_colored_silver' },
  }),
  D({
    id: 'crafting_table',
    displayName: 'Crafting Table',
    textures: { type: 'single', texture: 'crafting_table_top' },
  }),
]

/** Non-placeable held items (weapons, tools, materials). Shown in hotbar and first-person hand. */
const NON_PLACEABLE_ITEMS: BlockDefinition[] = [
  {
    id: 'wood_sword',
    displayName: 'Wooden Sword',
    textures: { type: 'single', texture: 'stone' },
    solid: false,
    placeable: false,
    occludes: false,
    itemTexture: 'wood_sword',
  },
  {
    id: 'stick',
    displayName: 'Stick',
    textures: { type: 'single', texture: 'stone' },
    solid: false,
    placeable: false,
    occludes: false,
    itemTexture: 'stick',
  },
  {
    id: 'coal',
    displayName: 'Coal',
    textures: { type: 'single', texture: 'stone' },
    solid: false,
    placeable: false,
    occludes: false,
    itemTexture: 'coal',
  },
  {
    id: 'raw_porkchop',
    displayName: 'Raw Porkchop',
    textures: { type: 'single', texture: 'stone' },
    solid: false,
    placeable: false,
    occludes: false,
    itemTexture: 'porkchop_raw',
  },
]

/** Block IDs that are weapons (left-click triggers slash, not mining). */
const WEAPON_IDS = new Set(NON_PLACEABLE_ITEMS.filter((d) => d.itemTexture?.includes('sword')).map((d) => d.id))

const REGISTRY = new Map<string, BlockDefinition>()
for (const def of [...LEGACY_BLOCKS, ...CURATED_BLOCKS, ...NON_PLACEABLE_ITEMS]) {
  if (REGISTRY.has(def.id)) {
    throw new Error(`Block registry duplicate id: ${def.id}`)
  }
  REGISTRY.set(def.id, def)
}

/** Returns the block definition for a given id, or undefined if not registered. */
export function getBlockDefinition(id: string): BlockDefinition | undefined {
  return REGISTRY.get(id)
}

/** Returns all registered block type ids (for save validation, hotbar icons, etc.). */
export function getAllBlockIds(): string[] {
  return Array.from(REGISTRY.keys())
}

/** Block IDs that can be placed from hotbar. Uses placeable flag (defaults to solid for backward compat). */
export function getPlaceableBlockIds(): string[] {
  return getAllBlockIds().filter((id) => {
    const def = REGISTRY.get(id)
    if (!def) return false
    return def.placeable === true
  })
}

/** True if the block type can be placed from hotbar (placeable flag). */
export function isPlaceableBlock(id: string): boolean {
  const def = REGISTRY.get(id)
  return def ? def.placeable === true : false
}

/** True if the block type is solid for collision and raycast. */
export function isSolidBlock(id: string): boolean {
  const def = REGISTRY.get(id)
  return def ? def.solid !== false : false
}

/** True if the block type occludes neighbor faces (opaque for face culling). Leaves and ice return false. */
export function isOccludingBlock(id: string): boolean {
  const def = REGISTRY.get(id)
  return def ? def.occludes !== false : false
}

/** True if the block type is a fluid (water source or flowing). */
export function isFluidBlock(id: string): boolean {
  const def = REGISTRY.get(id)
  return def ? def.fluid === 'water' : false
}

/** Block height in world units (1 = full block). Snow layers 1–8 use 1/8 … 8/8. Water source/flowing use definition or schema. */
export function getBlockHeight(blockType: string): number {
  const def = REGISTRY.get(blockType)
  if (def?.fluidHeight !== undefined) return def.fluidHeight
  const m = /^snow_layer_([1-8])$/.exec(blockType)
  if (m) return parseInt(m[1], 10) / 8
  const flowM = /^water_flowing_([1-7])$/.exec(blockType)
  if (flowM) return 0.9 - (parseInt(flowM[1], 10) - 1) * 0.05
  return 1
}

/** True if the block cannot be broken by the player (e.g. bedrock). */
export function isUnbreakableBlock(id: string): boolean {
  const def = REGISTRY.get(id)
  return def ? def.unbreakable === true : false
}

/** Seconds of holding to break the block; 0 = instant. Uses DEFAULT_BREAK_TIME_SECONDS when not set. */
export function getBlockBreakTime(id: string): number {
  const def = REGISTRY.get(id)
  return def !== undefined ? (def.breakTimeSeconds ?? DEFAULT_BREAK_TIME_SECONDS) : DEFAULT_BREAK_TIME_SECONDS
}

/** Display name for UI (tooltips, inventory). Falls back to id if not registered. */
export function getBlockDisplayName(id: string): string {
  const def = REGISTRY.get(id)
  return def ? def.displayName : id
}

/** Texture file names (without .png) for loading. Single block returns 1; six-face returns 6. For items with itemTexture, returns [itemTexture] for icon/held display. */
export function getBlockTextureNames(id: string): string[] {
  const def = REGISTRY.get(id)
  if (!def) return []
  if (def.itemTexture) return [def.itemTexture]
  if (def.textures.type === 'single') return [def.textures.texture]
  return [...def.textures.textures]
}

/** Item texture name for held items/weapons (e.g. wood_sword). Undefined for blocks. */
export function getItemTextureName(id: string): string | undefined {
  return REGISTRY.get(id)?.itemTexture
}

/** True if the block type is a weapon (e.g. sword); left-click triggers slash attack instead of mining. */
export function isWeapon(id: string): boolean {
  return WEAPON_IDS.has(id)
}

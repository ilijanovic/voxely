/** World and chunk constants (shared by terrain, chunk, rendering). */
export const BLOCK_SIZE = 1;
export const CHUNK_SIZE = 16;

/** Base path for block textures (Minecraft-style). */
export const BLOCK_TEXTURE_PATH = "/assets/minecraft/textures/block";
export const RENDER_DISTANCE = 4;
export const RENDER_DISTANCE_SQ = RENDER_DISTANCE * RENDER_DISTANCE;

/** World height in blocks (Y 0 to WORLD_HEIGHT), like original Minecraft. */
export const WORLD_HEIGHT = 128;

/** Global water level (block Y). Same as classic Minecraft (~sea level). */
export const WATER_LEVEL = 64;
/** Offset above block tops for water plane to avoid z-fighting. */
export const WATER_PLANE_Y_OFFSET = 0.05;

/** Spawn position (world block coords). */
export const SPAWN_X = 0;
export const SPAWN_Z = 0;

/**
 * Re-export terrain module for backwards compatibility.
 * Terrain logic and biomes live in ./terrain/ (see terrain/biomes/ for per-biome files).
 */
export {
  createChunkGenerator,
  ALL_BIOMES,
  type BlockModEntry,
  type ChunkDataPayload,
  type OverhangProfile,
} from './terrain'
export { idToType, CARVED_ID } from './terrain/block-ids'

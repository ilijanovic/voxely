/**
 * Re-export terrain module for backwards compatibility.
 * Terrain logic and biomes live in ./terrain/ (see terrain/biomes/ for per-biome files).
 */
export {
  createChunkGenerator,
  type BlockModEntry,
  type ChunkDataPayload,
} from "./terrain";

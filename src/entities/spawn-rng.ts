import type { AnimalKind } from './types'

/**
 * Folds a string into an existing deterministic signed 32-bit seed.
 *
 * @param seed - Seed to update
 * @param value - String input to fold into the seed
 * @returns Updated seed matching the previous spawn RNG behavior
 */
function hashIntoSeed(seed: number, value: string): number {
  for (let i = 0; i < value.length; i++) {
    seed = (seed << 5) - seed + value.charCodeAt(i)
  }
  return seed
}

/**
 * Creates the linear-congruential generator used by entity spawning.
 *
 * @param seed - Seed state before normalization
 * @param allowZeroSeed - When true, normalize exactly like the villager-village path
 * @returns Deterministic RNG in the [0, 1] range
 */
function makeLcg(seed: number, allowZeroSeed = false): () => number {
  let state = allowZeroSeed
    ? ((seed >>> 0) % 0x7fffffff || 1)
    : (Math.imul(seed, 0x7fffffff) >>> 0)

  return function (): number {
    state = Math.imul(state, 1103515245) + 12345
    return ((state >>> 0) % 0x7fffffff) / 0x7fffffff
  }
}

/**
 * Returns the per-chunk RNG used for generic chunk+kind based spawns.
 *
 * @param chunkKey - Chunk key string
 * @param kind - Spawned entity kind
 * @returns Deterministic RNG for that chunk/kind pair
 */
export function makeChunkRng(chunkKey: string, kind: AnimalKind): () => number {
  const seed = hashIntoSeed(0, chunkKey) + kind.length * 31
  return makeLcg(seed)
}

/**
 * Returns the per-zone RNG used for creature zone spawns.
 *
 * @param chunkKey - Chunk key string
 * @param zoneId - Zone identifier
 * @returns Deterministic RNG for that chunk/zone pair
 */
export function makeZoneChunkRng(chunkKey: string, zoneId: string): () => number {
  const seed = hashIntoSeed(hashIntoSeed(0, chunkKey), zoneId)
  return makeLcg(seed)
}

/**
 * Returns the natural creature RNG for a chunk.
 *
 * @param chunkKey - Chunk key string
 * @returns Deterministic RNG for natural spawn attempts in the chunk
 */
export function makeNaturalSpawnRng(chunkKey: string): () => number {
  const seed = hashIntoSeed(0, chunkKey) + 31 * 7
  return makeLcg(seed)
}

/**
 * Returns the village villager RNG for a chunk/village origin pair.
 *
 * @param chunkKey - Chunk key string
 * @param originX - Village origin x coordinate
 * @param originZ - Village origin z coordinate
 * @returns Deterministic RNG for villager count and offsets
 */
export function makeVillageSpawnRng(
  chunkKey: string,
  originX: number,
  originZ: number,
): () => number {
  const seed =
    hashIntoSeed(0, chunkKey) +
    Math.floor(originX) * 374761393 +
    Math.floor(originZ) * 668265263
  return makeLcg(seed, true)
}

/**
 * Returns the villager-variant RNG for a fixed villager spawn.
 *
 * @param chunkKey - Chunk key string
 * @param spawnX - Spawn x coordinate
 * @param spawnZ - Spawn z coordinate
 * @param spawnIndex - Index within the fixed-spawn list
 * @returns Deterministic RNG for villager appearance
 */
export function makeVillagerVariantRng(
  chunkKey: string,
  spawnX: number,
  spawnZ: number,
  spawnIndex: number,
): () => number {
  const seed =
    hashIntoSeed(0, chunkKey) +
    Math.floor(spawnX) * 374761393 +
    Math.floor(spawnZ) * 668265263 +
    spawnIndex * 31
  return makeChunkRng(String(seed), 'villager')
}

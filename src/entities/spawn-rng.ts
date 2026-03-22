import seedrandom from 'seedrandom'

/**
 * Returns a stable unsigned 32-bit hash for a string.
 *
 * @param s - Input string
 * @returns Unsigned 32-bit hash
 */
function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Creates a deterministic RNG for a composite key.
 *
 * @param key - Composite seed key
 * @returns RNG returning floats in [0,1)
 */
function makeRng(key: string): () => number {
  const seed = hash32(key)
  const rng = seedrandom(String(seed))
  return () => rng()
}

/**
 * RNG for natural (chunk-based) spawns.
 *
 * @param chunkKey - Chunk key string (stable)
 * @returns RNG
 */
export function makeNaturalSpawnRng(chunkKey: string): () => number {
  return makeRng(`natural:${chunkKey}`)
}

/**
 * RNG for village auto-spawns. Seeded by chunk and village origin so villages are stable.
 *
 * @param chunkKey - Chunk key string
 * @param originX - Village origin X
 * @param originZ - Village origin Z
 * @returns RNG
 */
export function makeVillageSpawnRng(chunkKey: string, originX: number, originZ: number): () => number {
  return makeRng(`village:${chunkKey}:${originX},${originZ}`)
}

/**
 * RNG for villager cosmetic variants for fixed spawns.
 *
 * @param chunkKey - Chunk key string
 * @param x - World X
 * @param z - World Z
 * @param index - Stable index inside the chunk's fixed spawn list
 * @returns RNG
 */
export function makeVillagerVariantRng(
  chunkKey: string,
  x: number,
  z: number,
  index: number,
): () => number {
  return makeRng(`villager-variant:${chunkKey}:${x},${z}:${index}`)
}

/**
 * RNG for creature-zone spawns per chunk and zone id.
 *
 * @param chunkKey - Chunk key string
 * @param zoneId - Zone id string
 * @returns RNG
 */
export function makeZoneChunkRng(chunkKey: string, zoneId: string): () => number {
  return makeRng(`zone:${chunkKey}:${zoneId}`)
}


/**
 * Persists heightmaps of discovered map chunks in IndexedDB so the full map can show
 * terrain detail for already-visited areas even when those chunks are unloaded.
 */

import { CHUNK_SIZE } from './constants'

const DB_NAME_PREFIX = 'voxel-map-'
const STORE_NAME = 'heightmaps'
const DB_VERSION = 1

/** In-memory cache for synchronous reads by getMapState. Key: chunkKeyNumeric. */
const cache = new Map<number, Float32Array>()
/** Biome index per column (same key as cache). Index into terrain ALL_BIOMES. */
const biomeCache = new Map<number, Uint8Array>()

/** Max number of heightmaps to keep in memory; evict oldest when preloading more. */
const MAX_CACHE_SIZE = 500

/** Order of insertion for LRU eviction when cache is full. */
const cacheOrder: number[] = []

/**
 * Opens the IndexedDB for the given world seed (one DB per seed so worlds don't share data).
 */
function openDb(worldSeed: number): Promise<IDBDatabase> {
  const name = `${DB_NAME_PREFIX}${worldSeed}`
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'chunkKey' })
      }
    }
  })
}

function evictLruIfNeeded(): void {
  while (cache.size > MAX_CACHE_SIZE && cacheOrder.length > 0) {
    const key = cacheOrder.shift()!
    cache.delete(key)
    biomeCache.delete(key)
  }
}

/**
 * Clears the in-memory cache. Call when loading a different world so old heightmaps are not shown.
 */
export function clearDiscoveredHeightmapCache(): void {
  cache.clear()
  biomeCache.clear()
  cacheOrder.length = 0
}

/**
 * Returns a cached heightmap for the chunk if available (sync). Used by getMapState.
 */
export function getCachedHeightmap(chunkKey: number): Float32Array | undefined {
  return cache.get(chunkKey)
}

/**
 * Returns a cached biome map for the chunk if available (sync). Used by getMapState for map coloring.
 */
export function getCachedBiomeMap(chunkKey: number): Uint8Array | undefined {
  return biomeCache.get(chunkKey)
}

/**
 * Persists a chunk heightmap (and optional biome map) to IndexedDB and in-memory cache.
 * Fire-and-forget; errors are ignored. Clones buffers so the chunk can be unloaded.
 *
 * @param worldSeed - World seed (used for DB name)
 * @param chunkKey - chunkKeyNumeric(cx, cz)
 * @param heightmap - Float32Array of length CHUNK_SIZE * CHUNK_SIZE
 * @param biomeBuffer - Optional Uint8Array of length CHUNK_SIZE * CHUNK_SIZE (index into ALL_BIOMES)
 */
export function writeHeightmap(
  worldSeed: number,
  chunkKey: number,
  heightmap: Float32Array,
  biomeBuffer?: Uint8Array,
): void {
  if (heightmap.length !== CHUNK_SIZE * CHUNK_SIZE) return
  const clone = new Float32Array(heightmap)
  cache.set(chunkKey, clone)
  if (biomeBuffer && biomeBuffer.length === CHUNK_SIZE * CHUNK_SIZE) {
    biomeCache.set(chunkKey, new Uint8Array(biomeBuffer))
  }
  if (!cacheOrder.includes(chunkKey)) cacheOrder.push(chunkKey)
  evictLruIfNeeded()

  const row: { chunkKey: number; buffer: ArrayBuffer; biomeBuffer?: ArrayBuffer } = {
    chunkKey,
    buffer: clone.buffer,
  }
  if (biomeBuffer && biomeBuffer.length === CHUNK_SIZE * CHUNK_SIZE) {
    row.biomeBuffer = biomeBuffer.buffer.slice(0) as ArrayBuffer
  }
  openDb(worldSeed)
    .then((db) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(row)
      return new Promise<void>((res, rej) => {
        tx.oncomplete = () => {
          db.close()
          res()
        }
        tx.onerror = () => rej(tx.error)
      })
    })
    .catch(() => {})
}

/**
 * Loads heightmaps from IndexedDB for the given chunk keys into the in-memory cache.
 * Respects limit to avoid loading thousands at once. Map UI will show them on next getMapState.
 *
 * @param worldSeed - World seed
 * @param chunkKeys - Chunk keys to load (e.g. discoveredChunkKeys)
 * @param limit - Max number to load in this batch (default 200)
 */
export async function preloadHeightmaps(
  worldSeed: number,
  chunkKeys: number[],
  limit = 200,
): Promise<void> {
  const toLoad = chunkKeys.filter((k) => !cache.has(k)).slice(0, limit)
  if (toLoad.length === 0) return
  const db = await openDb(worldSeed)
  const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME)
  for (const key of toLoad) {
    type StoredRow = { chunkKey: number; buffer: ArrayBuffer; biomeBuffer?: ArrayBuffer }
    const row = await new Promise<StoredRow | undefined>((resolve) => {
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result as StoredRow | undefined)
      req.onerror = () => resolve(undefined)
    })
    if (row?.buffer && row.buffer.byteLength >= CHUNK_SIZE * CHUNK_SIZE * 4) {
      const arr = new Float32Array(row.buffer)
      cache.set(key, arr)
      if (row.biomeBuffer && row.biomeBuffer.byteLength >= CHUNK_SIZE * CHUNK_SIZE) {
        biomeCache.set(key, new Uint8Array(row.biomeBuffer))
      }
      if (!cacheOrder.includes(key)) cacheOrder.push(key)
    }
  }
  evictLruIfNeeded()
  db.close()
}

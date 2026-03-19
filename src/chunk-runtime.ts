/**
 * Chunk and block modification state, key helpers, and block lookup.
 * applyChunkPayload, updateChunks, generateChunk stay in game.ts (scene/worker/meshes).
 */
import type { BlockType, ChunkData } from './types'
import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_MIN_Y } from './constants'
import type { BlockModEntry } from './terrain-core'
import {
  getBlockCollisionBoxesLocal,
  type CollisionBoxLocal,
  getBlockHeight,
  isFenceBlock,
  getFenceConnectionMask,
  getFenceCollisionBoxesLocal,
} from './block-registry'

export const chunks = new Map<number, ChunkData>()
export const blockModifications = new Map<string, BlockType | 'air'>()
export const columnHeightCache = new Map<number, number>()

/** Block modifications indexed by chunk key for fast worker requests (no global scan). */
const blockModsByChunkKeyNum = new Map<number, Map<string, BlockModEntry>>()

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`
}

export function chunkKeyNumeric(cx: number, cz: number): number {
  return ((cx & 0xffff) << 16) | (cz & 0xffff)
}

/** 9-bit Y index (world Y - WORLD_MIN_Y) for block key; supports Y in [-64, 319]. */
const BLOCK_KEY_Y_MASK = 0x1ff

export function blockKeyNumeric(bx: number, by: number, bz: number): number {
  const ix = (Math.floor(bx) + 1024) & 0x7ff
  const iy = (Math.floor(by) - WORLD_MIN_Y) & BLOCK_KEY_Y_MASK
  const iz = (Math.floor(bz) + 1024) & 0x7ff
  return ix | (iy << 11) | (iz << 20)
}

export function columnCacheKey(bx: number, bz: number): number {
  return ((bx & 0xffff) | ((bz & 0xffff) << 16)) >>> 0
}

const LOCAL_KEY_STRIDE_Z = CHUNK_SIZE * WORLD_HEIGHT

export function localKey(lx: number, ly: number, lz: number): number {
  return lx + ly * CHUNK_SIZE + lz * LOCAL_KEY_STRIDE_Z
}

export function decodeLocalKey(key: number): { lx: number; ly: number; lz: number } {
  const lz = Math.floor(key / LOCAL_KEY_STRIDE_Z)
  const rem = key - lz * LOCAL_KEY_STRIDE_Z
  const ly = Math.floor(rem / CHUNK_SIZE)
  const lx = rem % CHUNK_SIZE
  return { lx, ly, lz }
}

export function blockKeyFromNumeric(k: number): { bx: number; by: number; bz: number } {
  const bx = (k & 0x7ff) - 1024
  const by = ((k >> 11) & BLOCK_KEY_Y_MASK) + WORLD_MIN_Y
  const bz = ((k >> 20) & 0x7ff) - 1024
  return { bx, by, bz }
}

export function blockKeyString(bx: number, by: number, bz: number): string {
  return `${Math.floor(bx)},${Math.floor(by)},${Math.floor(bz)}`
}

/**
 * Sets or overwrites a block modification at the given integer cell.
 * Also updates the per-chunk index used by getBlockModsForChunk.
 */
export function setBlockModification(bx: number, by: number, bz: number, value: BlockType | 'air'): void {
  const x = Math.floor(bx)
  const y = Math.floor(by)
  const z = Math.floor(bz)
  const keyStr = blockKeyString(x, y, z)
  blockModifications.set(keyStr, value)
  const cx = Math.floor(x / CHUNK_SIZE)
  const cz = Math.floor(z / CHUNK_SIZE)
  const chunkKeyNum = chunkKeyNumeric(cx, cz)
  let byChunk = blockModsByChunkKeyNum.get(chunkKeyNum)
  if (!byChunk) {
    byChunk = new Map<string, BlockModEntry>()
    blockModsByChunkKeyNum.set(chunkKeyNum, byChunk)
  }
  byChunk.set(keyStr, { bx: x, by: y, bz: z, value })
}

/**
 * Removes a block modification override at the given integer cell (reverts to generated chunk data).
 * Also updates the per-chunk index used by getBlockModsForChunk.
 */
export function deleteBlockModification(bx: number, by: number, bz: number): void {
  const x = Math.floor(bx)
  const y = Math.floor(by)
  const z = Math.floor(bz)
  const keyStr = blockKeyString(x, y, z)
  blockModifications.delete(keyStr)
  const cx = Math.floor(x / CHUNK_SIZE)
  const cz = Math.floor(z / CHUNK_SIZE)
  const chunkKeyNum = chunkKeyNumeric(cx, cz)
  const byChunk = blockModsByChunkKeyNum.get(chunkKeyNum)
  if (!byChunk) return
  byChunk.delete(keyStr)
  if (byChunk.size === 0) blockModsByChunkKeyNum.delete(chunkKeyNum)
}

/**
 * Clears all block modifications and their chunk index.
 * Intended for tests and full world resets.
 */
export function clearBlockModifications(): void {
  blockModifications.clear()
  blockModsByChunkKeyNum.clear()
}

export function invalidateColumnHeight(bx: number, bz: number): void {
  columnHeightCache.delete(columnCacheKey(bx, bz))
}

/**
 * Block at integer cell (bx, by, bz) occupies world range [bx..bx+1], [by..by+1], [bz..bz+1].
 * This convention is shared with collision and rendering (worker geometry, instancing).
 */
export function getBlockAt(bx: number, by: number, bz: number): BlockType | 'air' | null {
  const ix = Math.floor(bx)
  const iy = Math.floor(by)
  const iz = Math.floor(bz)
  if (iy < WORLD_MIN_Y || iy >= WORLD_MIN_Y + WORLD_HEIGHT) return 'air'
  const mod = blockModifications.get(blockKeyString(ix, iy, iz))
  if (mod !== undefined) return mod
  const cx = Math.floor(ix / CHUNK_SIZE)
  const cz = Math.floor(iz / CHUNK_SIZE)
  const data = chunks.get(chunkKeyNumeric(cx, cz))
  if (!data) return null
  const lx = ix - data.cx * CHUNK_SIZE
  const ly = iy - WORLD_MIN_Y
  const lz = iz - data.cz * CHUNK_SIZE
  const type = data.voxelMap.get(localKey(lx, ly, lz))
  return type ?? 'air'
}

/**
 * Sky light level 0–15 at (bx, by, bz). Returns 0 if chunk unloaded or no sky light data.
 */
export function getSkyLightAt(bx: number, by: number, bz: number): number {
  const ix = Math.floor(bx)
  const iy = Math.floor(by)
  const iz = Math.floor(bz)
  if (iy < 0 || iy >= WORLD_HEIGHT) return 0
  const cx = Math.floor(ix / CHUNK_SIZE)
  const cz = Math.floor(iz / CHUNK_SIZE)
  const data = chunks.get(chunkKeyNumeric(cx, cz))
  if (!data?.skyLightBuffer) return 0
  const lx = ix - data.cx * CHUNK_SIZE
  const lz = iz - data.cz * CHUNK_SIZE
  return data.skyLightBuffer[localKey(lx, iy, lz)] ?? 0
}

/** Block height in world units at (bx, by, bz). 0 for air/unloaded; 1 for full block; 1/8..8/8 for snow layers. */
export function getBlockHeightAt(bx: number, by: number, bz: number): number {
  const type = getBlockAt(bx, by, bz)
  if (type === null || type === 'air') return 0
  return getBlockHeight(type)
}

export type CollisionBoxWorld = {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

/**
 * Returns collision boxes for the block at (bx, by, bz) in world space.
 * For fences, boxes depend on connection mask so gaps between adjacent fences are closed.
 * @returns Empty array for air/unloaded/non-solid blocks.
 */
export function getBlockCollisionBoxesAt(bx: number, by: number, bz: number): CollisionBoxWorld[] {
  const type = getBlockAt(bx, by, bz)
  if (type === null || type === 'air') return []
  const local: CollisionBoxLocal[] = isFenceBlock(type)
    ? getFenceCollisionBoxesLocal(getFenceConnectionMask(bx, by, bz, getBlockAt))
    : getBlockCollisionBoxesLocal(type)
  if (local.length === 0) return []
  return local.map((b) => ({
    minX: bx + b.minX,
    minY: by + b.minY,
    minZ: bz + b.minZ,
    maxX: bx + b.maxX,
    maxY: by + b.maxY,
    maxZ: bz + b.maxZ,
  }))
}

export function isSolidBlock(
  bx: number,
  by: number,
  bz: number,
  isBlockTypeSolid: (t: BlockType) => boolean,
): boolean {
  const type = getBlockAt(bx, by, bz)
  if (type === null || type === 'air') return false
  return isBlockTypeSolid(type)
}

export function isSolidBlockLoadedOnly(
  bx: number,
  by: number,
  bz: number,
  isBlockTypeSolid: (t: BlockType) => boolean,
): boolean {
  const type = getBlockAt(bx, by, bz)
  if (type === null) return false
  if (type === 'air') return false
  return isBlockTypeSolid(type)
}

export function getBlockModsForChunk(chunkX: number, chunkZ: number): BlockModEntry[] {
  const keyNum = chunkKeyNumeric(chunkX, chunkZ)
  const byChunk = blockModsByChunkKeyNum.get(keyNum)
  if (byChunk && byChunk.size > 0) return Array.from(byChunk.values())

  // Backward-compatible fallback: some call sites/tests may mutate `blockModifications` directly
  // without using setBlockModification(), which bypasses the per-chunk index.
  const out: BlockModEntry[] = []
  const x0 = chunkX * CHUNK_SIZE
  const z0 = chunkZ * CHUNK_SIZE
  const x1 = x0 + CHUNK_SIZE
  const z1 = z0 + CHUNK_SIZE

  for (const [k, value] of blockModifications) {
    const parsed = parseBlockKeyString(k)
    if (!parsed) continue
    if (parsed.bx >= x0 && parsed.bx < x1 && parsed.bz >= z0 && parsed.bz < z1) {
      out.push({ bx: parsed.bx, by: parsed.by, bz: parsed.bz, value })
    }
  }

  return out
}

/**
 * Parses a `blockKeyString()` value back into coordinates.
 *
 * @param key - Key in the form "bx,by,bz"
 * @returns Parsed coordinates or null when invalid
 */
function parseBlockKeyString(key: string): { bx: number; by: number; bz: number } | null {
  const a = key.indexOf(',')
  if (a < 0) return null
  const b = key.indexOf(',', a + 1)
  if (b < 0) return null
  const bx = Number(key.slice(0, a))
  const by = Number(key.slice(a + 1, b))
  const bz = Number(key.slice(b + 1))
  if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return null
  return { bx, by, bz }
}

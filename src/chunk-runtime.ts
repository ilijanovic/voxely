/**
 * Chunk and block modification state, key helpers, and block lookup.
 * applyChunkPayload, updateChunks, generateChunk stay in game.ts (scene/worker/meshes).
 */
import type { BlockType, ChunkData } from "./types";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./constants";
import type { BlockModEntry } from "./terrain-core";

export const chunks = new Map<number, ChunkData>();
export const blockModifications = new Map<string, BlockType | "air">();
export const columnHeightCache = new Map<number, number>();

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function chunkKeyNumeric(cx: number, cz: number): number {
  return ((cx & 0xffff) << 16) | (cz & 0xffff);
}

export function blockKeyNumeric(bx: number, by: number, bz: number): number {
  const ix = (Math.floor(bx) + 1024) & 0x7ff;
  const iy = Math.floor(by) & 0xff;
  const iz = (Math.floor(bz) + 1024) & 0x7ff;
  return ix | (iy << 11) | (iz << 19);
}

export function columnCacheKey(bx: number, bz: number): number {
  return ((bx & 0xffff) | ((bz & 0xffff) << 16)) >>> 0;
}

const LOCAL_KEY_STRIDE_Z = CHUNK_SIZE * WORLD_HEIGHT;

export function localKey(lx: number, ly: number, lz: number): number {
  return lx + ly * CHUNK_SIZE + lz * LOCAL_KEY_STRIDE_Z;
}

export function decodeLocalKey(key: number): { lx: number; ly: number; lz: number } {
  const lz = Math.floor(key / LOCAL_KEY_STRIDE_Z);
  const rem = key - lz * LOCAL_KEY_STRIDE_Z;
  const ly = Math.floor(rem / CHUNK_SIZE);
  const lx = rem % CHUNK_SIZE;
  return { lx, ly, lz };
}

export function blockKeyFromNumeric(k: number): { bx: number; by: number; bz: number } {
  const bx = (k & 0x7ff) - 1024;
  const by = (k >> 11) & 0xff;
  const bz = ((k >> 19) & 0x7ff) - 1024;
  return { bx, by, bz };
}

export function blockKeyString(bx: number, by: number, bz: number): string {
  return `${Math.floor(bx)},${Math.floor(by)},${Math.floor(bz)}`;
}

export function invalidateColumnHeight(bx: number, bz: number): void {
  columnHeightCache.delete(columnCacheKey(bx, bz));
}

/**
 * Block at integer cell (bx, by, bz) occupies world range [bx..bx+1], [by..by+1], [bz..bz+1].
 * This convention is shared with collision and rendering (worker geometry, instancing).
 */
export function getBlockAt(
  bx: number,
  by: number,
  bz: number
): BlockType | "air" | null {
  const ix = Math.floor(bx);
  const iy = Math.floor(by);
  const iz = Math.floor(bz);
  if (iy < 0 || iy >= WORLD_HEIGHT) return "air";
  const mod = blockModifications.get(blockKeyString(ix, iy, iz));
  if (mod !== undefined) return mod;
  const cx = Math.floor(ix / CHUNK_SIZE);
  const cz = Math.floor(iz / CHUNK_SIZE);
  const data = chunks.get(chunkKeyNumeric(cx, cz));
  if (!data) return null;
  const lx = ix - data.cx * CHUNK_SIZE;
  const lz = iz - data.cz * CHUNK_SIZE;
  const type = data.voxelMap.get(localKey(lx, iy, lz));
  return type ?? "air";
}

export function isSolidBlock(
  bx: number,
  by: number,
  bz: number,
  isBlockTypeSolid: (t: BlockType) => boolean
): boolean {
  const type = getBlockAt(bx, by, bz);
  if (type === null || type === "air") return false;
  return isBlockTypeSolid(type);
}

export function isSolidBlockLoadedOnly(
  bx: number,
  by: number,
  bz: number,
  isBlockTypeSolid: (t: BlockType) => boolean
): boolean {
  const type = getBlockAt(bx, by, bz);
  if (type === null) return false;
  if (type === "air") return false;
  return isBlockTypeSolid(type);
}

export function getBlockModsForChunk(chunkX: number, chunkZ: number): BlockModEntry[] {
  const entries: BlockModEntry[] = [];
  for (const [strKey, value] of blockModifications) {
    const parts = strKey.split(",");
    const bx = Number(parts[0]);
    const by = Number(parts[1]);
    const bz = Number(parts[2]);
    if (Math.floor(bx / CHUNK_SIZE) !== chunkX || Math.floor(bz / CHUNK_SIZE) !== chunkZ)
      continue;
    entries.push({ bx, by, bz, value });
  }
  return entries;
}

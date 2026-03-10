import { CHUNK_SIZE } from "../../constants";

export type ChunkCoord = { cx: number; cz: number };
export type ChunkLod = "full" | "far";
export type PlannedChunk = { cx: number; cz: number; lod: ChunkLod };

export type ChunkPlanningInput = {
  playerX: number;
  playerZ: number;
  renderDistance: number;
  renderDistanceSq: number;
  farLodStartDistance?: number;
  existingChunks: Array<{ keyNum: number; cx: number; cz: number; lod?: ChunkLod }>;
  pendingChunkKeys: Set<number>;
  useWorker: boolean;
  lookDirection?: { x: number; z: number };
  chunkKeyNumeric: (cx: number, cz: number) => number;
};

export type ChunkPlanningOutput = {
  toLoad: PlannedChunk[];
  toUnload: number[];
};

function hasLookDirection(lookDirection?: { x: number; z: number }): boolean {
  if (!lookDirection) return false;
  const { x, z } = lookDirection;
  return x * x + z * z > 0.01;
}

/**
 * Sort chunks so those in front of the player are requested first.
 * Uses dot product with look direction (larger dot = more in front).
 */
export function sortChunksByLookPriority(
  chunks: PlannedChunk[],
  playerX: number,
  playerZ: number,
  lookDirection?: { x: number; z: number }
): PlannedChunk[] {
  if (!hasLookDirection(lookDirection)) return chunks;
  const lx = lookDirection!.x;
  const lz = lookDirection!.z;
  return [...chunks].sort((a, b) => {
    const ax = a.cx * CHUNK_SIZE + CHUNK_SIZE / 2 - 0.5 - playerX;
    const az = a.cz * CHUNK_SIZE + CHUNK_SIZE / 2 - 0.5 - playerZ;
    const bx = b.cx * CHUNK_SIZE + CHUNK_SIZE / 2 - 0.5 - playerX;
    const bz = b.cz * CHUNK_SIZE + CHUNK_SIZE / 2 - 0.5 - playerZ;
    const dotA = ax * lx + az * lz;
    const dotB = bx * lx + bz * lz;
    return dotB - dotA;
  });
}

export function planChunksAroundPlayer(input: ChunkPlanningInput): ChunkPlanningOutput {
  const chunkX = Math.floor(input.playerX / CHUNK_SIZE);
  const chunkZ = Math.floor(input.playerZ / CHUNK_SIZE);

  const existingChunkByKey = new Map<number, { cx: number; cz: number; lod?: ChunkLod }>();
  for (const c of input.existingChunks) existingChunkByKey.set(c.keyNum, c);

  const farStart = Math.max(2, Math.min(input.renderDistance, Math.floor(input.farLodStartDistance ?? input.renderDistance - 2)));
  const farStartSq = farStart * farStart;

  const toLoad: PlannedChunk[] = [];
  const toUnload: number[] = [];
  for (let dx = -input.renderDistance; dx <= input.renderDistance; dx++) {
    for (let dz = -input.renderDistance; dz <= input.renderDistance; dz++) {
      if (dx * dx + dz * dz > input.renderDistanceSq) continue;
      const cx = chunkX + dx;
      const cz = chunkZ + dz;
      const keyNum = input.chunkKeyNumeric(cx, cz);
      const desiredLod: ChunkLod = dx * dx + dz * dz > farStartSq ? "far" : "full";
      const existing = existingChunkByKey.get(keyNum);
      if (existing) {
        const existingLod = existing.lod ?? "full";
        if (existingLod !== desiredLod) {
          // Upgrade/downgrade: unload current representation and request desired LOD.
          toUnload.push(keyNum);
          if (input.useWorker) {
            if (!input.pendingChunkKeys.has(keyNum)) toLoad.push({ cx, cz, lod: desiredLod });
          } else {
            toLoad.push({ cx, cz, lod: desiredLod });
          }
        }
        continue;
      }
      if (input.useWorker) {
        if (input.pendingChunkKeys.has(keyNum)) continue;
        toLoad.push({ cx, cz, lod: desiredLod });
      } else {
        // Without worker, caller will synchronously generate missing chunks.
        toLoad.push({ cx, cz, lod: desiredLod });
      }
    }
  }

  const sortedToLoad = input.useWorker
    ? sortChunksByLookPriority(toLoad, input.playerX, input.playerZ, input.lookDirection)
    : toLoad;

  for (const c of input.existingChunks) {
    const distSq = (c.cx - chunkX) * (c.cx - chunkX) + (c.cz - chunkZ) * (c.cz - chunkZ);
    if (distSq > input.renderDistanceSq) toUnload.push(c.keyNum);
  }

  return { toLoad: sortedToLoad, toUnload };
}


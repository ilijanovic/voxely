export type PendingSpawn = {
  spawnX: number;
  spawnZ: number;
  chunkKeys: Set<number>;
};

export function isPendingSpawnReady(
  pendingSpawn: PendingSpawn,
  hasChunkKey: (keyNum: number) => boolean
): boolean {
  for (const keyNum of pendingSpawn.chunkKeys) {
    if (!hasChunkKey(keyNum)) return false;
  }
  return true;
}


import type * as THREE from "three";
import { chunks, chunkKey, chunkKeyNumeric, getBlockModsForChunk } from "../../chunk-runtime";
import { getRenderDistance, getRenderDistanceSq } from "../../graphics-settings";
import { spawnEntitiesForChunk } from "../../entities/spawn";
import { planChunksAroundPlayer } from "./chunk-planning";
import type { ChunkWorkerClient } from "./chunk-worker-client";

export function updateChunks(params: {
  scene: THREE.Scene;
  player: THREE.Group;
  lookDirection?: { x: number; z: number };
  chunkWorker: ChunkWorkerClient | null;
  pendingChunkKeys: Set<number>;
  generateChunkSync: (scene: THREE.Scene, cx: number, cz: number) => void;
  unloadChunk: (scene: THREE.Scene, keyNum: number) => void;
}): void {
  const keysBefore = new Set(chunks.keys());
  const rd = getRenderDistance();
  const rdSq = getRenderDistanceSq();

  const existingChunks = Array.from(chunks.entries()).map(([keyNum, data]) => ({
    keyNum,
    cx: data.cx,
    cz: data.cz,
    lod: data.lod,
  }));

  const useWorker = !!params.chunkWorker;
  const { toLoad, toUnload } = planChunksAroundPlayer({
    playerX: params.player.position.x,
    playerZ: params.player.position.z,
    renderDistance: rd,
    renderDistanceSq: rdSq,
    existingChunks,
    pendingChunkKeys: params.pendingChunkKeys,
    useWorker,
    lookDirection: params.lookDirection,
    chunkKeyNumeric,
  });

  // Unload first so LOD replacements can be applied by incoming payloads.
  for (const keyNum of toUnload) params.unloadChunk(params.scene, keyNum);

  if (useWorker) {
    for (const { cx, cz, lod } of toLoad) {
      const keyNum = chunkKeyNumeric(cx, cz);
      params.pendingChunkKeys.add(keyNum);
      params.chunkWorker!.requestChunk({
        chunkX: cx,
        chunkZ: cz,
        lod,
        blockMods: getBlockModsForChunk(cx, cz),
      });
    }
  } else {
    for (const { cx, cz, lod } of toLoad) {
      if (lod === "far") {
        // Sync fallback does not support far LOD; generate full chunk.
        params.generateChunkSync(params.scene, cx, cz);
      } else {
        params.generateChunkSync(params.scene, cx, cz);
      }
    }
  }

  for (const [keyNum, data] of chunks) {
    if (!keysBefore.has(keyNum)) {
      spawnEntitiesForChunk(params.scene, chunkKey(data.cx, data.cz), data.cx, data.cz);
    }
  }
}


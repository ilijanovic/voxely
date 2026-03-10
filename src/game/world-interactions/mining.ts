import type { BlockPos, BlockType, ChunkData } from "../../types";

export function breakBlock(params: {
  chunkKeyNum: number;
  blockType: BlockType;
  worldX: number;
  worldY: number;
  worldZ: number;
  chunks: Map<number, ChunkData>;
  getLayerPositions: (data: ChunkData, blockType: BlockType) => BlockPos[] | null;
  isUnbreakableBlock: (blockType: BlockType) => boolean;
  blockModifications: Map<string, BlockType | "air">;
  blockKeyString: (x: number, y: number, z: number) => string;
  invalidateColumnHeight: (x: number, z: number) => void;
  localKey: (lx: number, ly: number, lz: number) => number;
  chunkSize: number;
  isSolidBlock: (blockType: BlockType) => boolean;
  getBlockHeight: (blockType: BlockType) => number;
  getBlockAt: (x: number, y: number, z: number) => BlockType | "air" | null;
  refreshChunkVisibleMeshes: (data: ChunkData, affectedBlockTypes?: Set<BlockType>) => void;
  spawnDrop: (worldX: number, worldY: number, worldZ: number, blockType: BlockType) => void;
}): void {
  if (params.isUnbreakableBlock(params.blockType)) return;
  const data = params.chunks.get(params.chunkKeyNum);
  if (!data) return;
  const positions = params.getLayerPositions(data, params.blockType);
  if (!positions) return;
  const instanceIndex = positions.findIndex(
    (p) =>
      p.x === params.worldX &&
      p.y === params.worldY &&
      p.z === params.worldZ
  );
  const pos =
    instanceIndex >= 0
      ? positions[instanceIndex]
      : { x: params.worldX, y: params.worldY, z: params.worldZ };

  params.blockModifications.set(
    params.blockKeyString(pos.x, pos.y, pos.z),
    "air"
  );
  params.invalidateColumnHeight(pos.x, pos.z);
  const lx = pos.x - data.cx * params.chunkSize;
  const lz = pos.z - data.cz * params.chunkSize;
  data.voxelMap.delete(params.localKey(lx, pos.y, lz));

  const affectedBlockTypes = new Set<BlockType>([params.blockType]);
  const neighbors: [number, number, number][] = [
    [pos.x + 1, pos.y, pos.z],
    [pos.x - 1, pos.y, pos.z],
    [pos.x, pos.y + 1, pos.z],
    [pos.x, pos.y - 1, pos.z],
    [pos.x, pos.y, pos.z + 1],
    [pos.x, pos.y, pos.z - 1],
  ];
  for (const [nx, ny, nz] of neighbors) {
    const t = params.getBlockAt(nx, ny, nz);
    if (t !== null && t !== "air") affectedBlockTypes.add(t as BlockType);
  }

  if (instanceIndex === -1) {
    params.refreshChunkVisibleMeshes(data, affectedBlockTypes);
    return;
  }

  const cx = pos.x + 0.5;
  const cz = pos.z + 0.5;
  const dropSize = 0.35;
  let groundY = pos.y - 1 + 0.5;
  for (let by = pos.y - 1; by >= 0; by--) {
    const t = params.getBlockAt(pos.x, by, pos.z);
    if (t !== null && t !== "air" && params.isSolidBlock(t as BlockType)) {
      groundY = by + params.getBlockHeight(t as BlockType);
      break;
    }
  }
  const cy = groundY + dropSize * 0.5;
  params.spawnDrop(cx, cy, cz, params.blockType);
  params.refreshChunkVisibleMeshes(data, affectedBlockTypes);
}


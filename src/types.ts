import type * as THREE from "three";

/** Block types used in the world (keys of shared materials). */
export type BlockType =
  | "grass"
  | "dirt"
  | "stone"
  | "sand"
  | "snow"
  | "water"
  | "wood"
  | "leaves"
  | "torch"
  | "bedrock";

/** Biomes for terrain and block placement. */
export type Biome = "plains" | "desert" | "forest" | "jungle" | "mountain" | "snow";

/** Integer block position in world space. */
export type BlockPos = { x: number; y: number; z: number };

/** Chunk container: group with InstancedMeshes + position arrays for mining. */
export interface ChunkData {
  group: THREE.Group;
  /** Chunk coordinates (for frustum/iteration without parsing key). */
  cx: number;
  cz: number;
  /** O(1) block lookup by local key (localKey(lx, ly, lz)). Used for voxel collision. */
  voxelMap: Map<number, BlockType>;
  grassPos: BlockPos[];
  dirtPos: BlockPos[];
  stonePos: BlockPos[];
  sandPos: BlockPos[];
  snowPos: BlockPos[];
  woodPos: BlockPos[];
  leavesPos: BlockPos[];
  bedrockPos: BlockPos[];
}

/** Tree noise caches per chunk (key: "wx,wz"). */
export type TreeNoiseCaches = {
  treePlacement: Map<string, number>;
  forestDensity: Map<string, number>;
};

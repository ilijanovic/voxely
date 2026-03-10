import * as THREE from "three";
import type { BlockType, ChunkData, BlockPos, TreeNoiseCaches } from "../../types";
import {
  CHUNK_SIZE,
  WATER_LEVEL,
  WATER_BLOCK_HEIGHT,
  WATER_PLANE_Y_OFFSET,
  WORLD_HEIGHT,
} from "../../constants";
import {
  WORLD_SEED,
  getHeight,
  getResolvedBiome,
  getBlockTypeAt,
  generateTree,
  shouldPlaceTree,
  getTreePlacement,
  getForestDensity,
} from "../../game-terrain";
import {
  chunks,
  blockModifications,
  chunkKeyNumeric,
  chunkKey,
  blockKeyNumeric,
  blockKeyString,
  localKey,
  decodeLocalKey,
  invalidateColumnHeight,
  getBlockAt,
} from "../../chunk-runtime";
import { filterVisibleBlocks as filterVisibleBlocksPure } from "./visible-blocks";
import {
  isSolidBlock as isBlockTypeSolid,
  isUnbreakableBlock,
} from "../../block-registry";
import {
  setGrassInstanceColors,
  setFoliageInstanceColors,
  FOLIAGE_BLOCK_TYPES,
  sharedBlockGeometry,
  sharedTallGrassGeometry,
  getMaterialForBlockType,
} from "../../block-materials";
import {
  despawnEntitiesInChunk,
} from "../../entities/spawn";
import {
  spawnDrop as spawnDropItem,
  type Drop,
} from "../world-interactions/drops";
import {
  placeTorch as placeTorchSystem,
  type PlacedTorch,
} from "../world-interactions/torches";
import { breakBlock as breakBlockSystem } from "../world-interactions/mining";
import { RaycastMeshCache } from "./raycast-cache";

// Scratch buffers (reused every frame to avoid allocations)
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();

export interface ChunkSyncContext {
  grassColormapData: ImageData | null;
  foliageColormapData: ImageData | null;
  tallGrassMaterial: THREE.MeshStandardMaterial | null;
  raycastMeshCache: RaycastMeshCache;
  frustumDirty: boolean;
  scene: THREE.Scene;
  drops: Drop[];
  torchContainer: THREE.Group;
  placedTorches: PlacedTorch[];
}

function hasVertexColorsEnabled(
  material: THREE.Material | THREE.Material[]
): boolean {
  if (Array.isArray(material)) {
    return material.some(
      (m) => m instanceof THREE.MeshStandardMaterial && m.vertexColors
    );
  }
  return (
    material instanceof THREE.MeshStandardMaterial && material.vertexColors
  );
}

function ensureWhiteInstanceColorsForVertexColorMaterial(
  mesh: THREE.InstancedMesh,
  material: THREE.Material | THREE.Material[],
  count: number
): void {
  if (!hasVertexColorsEnabled(material) || mesh.instanceColor) return;
  const array = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    array[i * 3] = 1;
    array[i * 3 + 1] = 1;
    array[i * 3 + 2] = 1;
  }
  mesh.instanceColor = new THREE.InstancedBufferAttribute(array, 3);
  mesh.instanceColor.needsUpdate = true;
}

export function addInstancedLayer(
  group: THREE.Group,
  positions: BlockPos[],
  material: THREE.Material | THREE.Material[],
  userData?: { chunkKeyNum: number; blockType: BlockType }
): THREE.InstancedMesh | null {
  const count = positions.length;
  if (count === 0) return null;

  const mesh = new THREE.InstancedMesh(
    sharedBlockGeometry,
    material as THREE.Material,
    count
  );
  mesh.count = count;

  for (let i = 0; i < count; i++) {
    const p = positions[i];
    _position.set(p.x, p.y, p.z);
    _matrix.makeTranslation(_position.x, _position.y, _position.z);
    mesh.setMatrixAt(i, _matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  ensureWhiteInstanceColorsForVertexColorMaterial(mesh, material, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (userData) mesh.userData = userData;

  group.add(mesh);
  return mesh;
}

export function buildChunkWaterGeometry(
  worldX: number,
  worldZ: number,
  heightmap?: number[][]
): THREE.BufferGeometry | null {
  const waterY = WATER_LEVEL + WATER_BLOCK_HEIGHT + WATER_PLANE_Y_OFFSET;
  const gridSize = CHUNK_SIZE + 1;
  const positions = new Float32Array(gridSize * gridSize * 3);
  const normals = new Float32Array(gridSize * gridSize * 3);
  for (let lz = 0; lz < gridSize; lz++) {
    for (let lx = 0; lx < gridSize; lx++) {
      const i = (lx + lz * gridSize) * 3;
      positions[i] = worldX + lx;
      positions[i + 1] = waterY;
      positions[i + 2] = worldZ + lz;
      normals[i] = 0;
      normals[i + 1] = 1;
      normals[i + 2] = 0;
    }
  }
  const indices: number[] = [];
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const topY = heightmap
        ? heightmap[lx][lz]
        : getHeight(worldX + lx, worldZ + lz);
      if (topY >= WATER_LEVEL) continue;
      const i00 = lx + lz * gridSize;
      const i10 = lx + 1 + lz * gridSize;
      const i01 = lx + (lz + 1) * gridSize;
      const i11 = lx + 1 + (lz + 1) * gridSize;
      indices.push(i00, i10, i11, i00, i11, i01);
    }
  }
  if (indices.length === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return geo;
}

export function buildPositionsByType(
  worldX: number,
  worldZ: number,
  voxelMapEntries: Array<[number, BlockType]>
): Map<BlockType, BlockPos[]> {
  const byType = new Map<BlockType, BlockPos[]>();
  for (const [key, blockType] of voxelMapEntries) {
    const { lx, ly, lz } = decodeLocalKey(key);
    const pos: BlockPos = { x: worldX + lx, y: ly, z: worldZ + lz };
    const arr = byType.get(blockType) ?? [];
    arr.push(pos);
    byType.set(blockType, arr);
  }
  return byType;
}

const GRASS_BLOCK_TYPES_FOR_TALL_GRASS: BlockType[] = [
  "grass",
  "grass_savanna",
];
const TALL_GRASS_SPAWN_CHANCE = 0.05;
const TALL_GRASS_Y_OFFSET = -0.02;

function pseudoRandomFromBlockPos(x: number, y: number, z: number): number {
  let h = WORLD_SEED >>> 0;
  h ^= Math.imul((x | 0) >>> 0, 374761393);
  h = (h << 13) | (h >>> 19);
  h ^= Math.imul((y | 0) >>> 0, 668265263);
  h = (h << 11) | (h >>> 21);
  h ^= Math.imul((z | 0) >>> 0, 2147483647);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h >>> 0) & 0xffffffff) / 0x100000000;
}

export function getTallGrassPositions(
  worldX: number,
  worldZ: number,
  voxelMap: Map<number, BlockType>,
  positionsByType: Map<BlockType, BlockPos[]>
): BlockPos[] {
  const out: BlockPos[] = [];
  for (const blockType of GRASS_BLOCK_TYPES_FOR_TALL_GRASS) {
    const positions = positionsByType.get(blockType);
    if (!positions) continue;
    for (const p of positions) {
      const lx = p.x - worldX;
      const lz = p.z - worldZ;
      const keyAbove = localKey(lx, p.y + 1, lz);
      if (voxelMap.has(keyAbove)) continue;
      if (pseudoRandomFromBlockPos(p.x, p.y, p.z) > TALL_GRASS_SPAWN_CHANCE)
        continue;
      out.push(p);
    }
  }
  return out;
}

export function addTallGrassLayer(
  group: THREE.Group,
  positions: BlockPos[],
  material: THREE.MeshStandardMaterial
): THREE.InstancedMesh | null {
  if (positions.length === 0) return null;
  const mesh = new THREE.InstancedMesh(
    sharedTallGrassGeometry,
    material,
    positions.length
  );
  mesh.count = positions.length;
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    _position.set(p.x + 0.5, p.y + 0.5 + TALL_GRASS_Y_OFFSET, p.z + 0.5);
    _matrix.makeTranslation(_position.x, _position.y, _position.z);
    mesh.setMatrixAt(i, _matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  ensureWhiteInstanceColorsForVertexColorMaterial(
    mesh,
    material,
    positions.length
  );
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export function filterVisibleBlocks(
  worldX: number,
  worldZ: number,
  voxelMap: Map<number, BlockType>,
  positions: BlockPos[]
): BlockPos[] {
  return filterVisibleBlocksPure({
    worldX,
    worldZ,
    chunkSize: CHUNK_SIZE,
    worldHeight: WORLD_HEIGHT,
    voxelMap,
    positions,
    localKey,
    isSolidBlock: isBlockTypeSolid,
  });
}

export function getLayerPositions(
  data: ChunkData,
  blockType: BlockType
): BlockPos[] | null {
  return data.blockPositionsByType.get(blockType) ?? null;
}

export function getBlockWorldPosition(
  chunkKeyNum: number,
  blockType: BlockType,
  instanceId: number
): BlockPos | null {
  const data = chunks.get(chunkKeyNum);
  if (!data) return null;
  const positions = getLayerPositions(data, blockType);
  if (!positions || instanceId < 0 || instanceId >= positions.length)
    return null;
  return positions[instanceId];
}

export function spawnDrop(
  ctx: ChunkSyncContext,
  worldX: number,
  worldY: number,
  worldZ: number,
  blockType: BlockType
): void {
  spawnDropItem({ scene: ctx.scene, drops: ctx.drops, worldX, worldY, worldZ, blockType });
}

export function placeTorch(
  ctx: ChunkSyncContext,
  worldX: number,
  worldY: number,
  worldZ: number
): boolean {
  return placeTorchSystem({
    worldX,
    worldY,
    worldZ,
    torchContainer: ctx.torchContainer,
    placedTorches: ctx.placedTorches,
    blockKeyNumeric,
  });
}

export function rebuildChunkLayer(
  ctx: ChunkSyncContext,
  data: ChunkData,
  blockType: BlockType
): void {
  const keyNum = chunkKeyNumeric(data.cx, data.cz);
  const positions = getLayerPositions(data, blockType);
  if (!positions) return;

  for (let i = data.group.children.length - 1; i >= 0; i--) {
    const child = data.group.children[i];
    if (
      child instanceof THREE.InstancedMesh &&
      (child.userData as { blockType?: BlockType }).blockType === blockType
    ) {
      data.group.remove(child);
      child.dispose();
      break;
    }
  }

  if (positions.length === 0) return;

  const mesh = addInstancedLayer(
    data.group,
    positions,
    getMaterialForBlockType(blockType),
    {
      chunkKeyNum: keyNum,
      blockType,
    }
  );
  if (
    mesh &&
    (blockType === "grass" || blockType === "grass_savanna") &&
    ctx.grassColormapData
  ) {
    setGrassInstanceColors(
      mesh,
      positions,
      getResolvedBiome,
      ctx.grassColormapData
    );
  }
  if (mesh && FOLIAGE_BLOCK_TYPES.includes(blockType) && ctx.foliageColormapData) {
    setFoliageInstanceColors(
      mesh,
      positions,
      getResolvedBiome,
      ctx.foliageColormapData
    );
  }
}

export function refreshChunkVisibleMeshes(
  ctx: ChunkSyncContext,
  data: ChunkData
): void {
  const worldX = data.cx * CHUNK_SIZE;
  const worldZ = data.cz * CHUNK_SIZE;
  const previousTypes = new Set<BlockType>(data.blockPositionsByType.keys());
  const positionsByType = buildPositionsByType(
    worldX,
    worldZ,
    Array.from(data.voxelMap.entries()) as Array<[number, BlockType]>
  );
  const nextVisibleByType = new Map<BlockType, BlockPos[]>();

  for (const [blockType, positions] of positionsByType) {
    nextVisibleByType.set(
      blockType,
      filterVisibleBlocks(worldX, worldZ, data.voxelMap, positions)
    );
  }
  for (const blockType of previousTypes) {
    if (!nextVisibleByType.has(blockType)) nextVisibleByType.set(blockType, []);
  }

  data.blockPositionsByType = nextVisibleByType;
  for (const blockType of nextVisibleByType.keys()) {
    rebuildChunkLayer(ctx, data, blockType);
  }
  ctx.raycastMeshCache.markDirty();
  ctx.frustumDirty = true;
}

export function breakBlock(
  ctx: ChunkSyncContext,
  chunkKeyNum: number,
  blockType: BlockType,
  worldX: number,
  worldY: number,
  worldZ: number
): void {
  breakBlockSystem({
    chunkKeyNum,
    blockType,
    worldX,
    worldY,
    worldZ,
    chunks,
    getLayerPositions,
    isUnbreakableBlock,
    blockModifications,
    blockKeyString,
    invalidateColumnHeight,
    localKey,
    chunkSize: CHUNK_SIZE,
    isSolidBlock: isBlockTypeSolid,
    getBlockAt,
    refreshChunkVisibleMeshes: (data) => refreshChunkVisibleMeshes(ctx, data),
    spawnDrop: (wx, wy, wz, bt) => spawnDrop(ctx, wx, wy, wz, bt),
  });
}

export function unloadChunk(scene: THREE.Scene, keyNum: number, raycastMeshCache: RaycastMeshCache): { frustumDirty: boolean } {
  const data = chunks.get(keyNum);
  if (!data) return { frustumDirty: false };
  despawnEntitiesInChunk(scene, chunkKey(data.cx, data.cz));

  data.group.traverse((obj) => {
    if (
      obj instanceof THREE.Mesh &&
      obj.geometry &&
      obj.geometry !== sharedBlockGeometry
    ) {
      obj.geometry.dispose();
    }
  });
  scene.remove(data.group);
  chunks.delete(keyNum);
  raycastMeshCache.markDirty();
  return { frustumDirty: true };
}

export function generateChunk(
  ctx: ChunkSyncContext,
  chunkX: number,
  chunkZ: number
): ChunkData {
  const keyNum = chunkKeyNumeric(chunkX, chunkZ);
  const existing = chunks.get(keyNum);
  if (existing) return existing;

  const worldX = chunkX * CHUNK_SIZE;
  const worldZ = chunkZ * CHUNK_SIZE;

  const heightmap: number[][] = [];
  for (let x = 0; x < CHUNK_SIZE; x++) {
    heightmap[x] = [];
    for (let z = 0; z < CHUNK_SIZE; z++) {
      heightmap[x][z] = getHeight(worldX + x, worldZ + z);
    }
  }

  const voxelMap = new Map<number, BlockType>();

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wx = worldX + x;
      const wz = worldZ + z;
      const topY = heightmap[x][z];
      const biome = getResolvedBiome(wx, wz);

      for (let y = 0; y <= topY; y++) {
        let type = getBlockTypeAt(biome, y, topY);
        const mod = blockModifications.get(blockKeyString(wx, y, wz));
        if (mod === "air") continue;
        if (mod !== undefined) type = mod;
        if (type === "water") continue;
        voxelMap.set(localKey(x, y, z), type);
      }
    }
  }

  const group = new THREE.Group();
  const minX = worldX;
  const minZ = worldZ;
  const maxX = worldX + CHUNK_SIZE - 1;
  const maxZ = worldZ + CHUNK_SIZE - 1;
  const treePlacementCache = new Map<string, number>();
  const forestDensityCache = new Map<string, number>();
  for (let twx = minX; twx <= maxX; twx++) {
    for (let twz = minZ; twz <= maxZ; twz++) {
      treePlacementCache.set(`${twx},${twz}`, getTreePlacement(twx, twz));
      forestDensityCache.set(`${twx},${twz}`, getForestDensity(twx, twz));
    }
  }
  const treeCaches: TreeNoiseCaches = {
    treePlacement: treePlacementCache,
    forestDensity: forestDensityCache,
  };
  for (let twx = minX; twx <= maxX; twx++) {
    for (let twz = minZ; twz <= maxZ; twz++) {
      if (!shouldPlaceTree(twx, twz, treeCaches)) continue;
      const baseY = getHeight(twx, twz);
      const { wood, leaves } = generateTree(twx, baseY, twz);
      for (const b of wood) {
        if (
          b.x >= worldX &&
          b.x < worldX + CHUNK_SIZE &&
          b.z >= worldZ &&
          b.z < worldZ + CHUNK_SIZE &&
          blockModifications.get(blockKeyString(b.x, b.y, b.z)) !== "air"
        ) {
          voxelMap.set(localKey(b.x - worldX, b.y, b.z - worldZ), "wood");
        }
      }
      for (const b of leaves) {
        if (
          b.x >= worldX &&
          b.x < worldX + CHUNK_SIZE &&
          b.z >= worldZ &&
          b.z < worldZ + CHUNK_SIZE &&
          blockModifications.get(blockKeyString(b.x, b.y, b.z)) !== "air" &&
          b.y > getHeight(b.x, b.z)
        ) {
          voxelMap.set(localKey(b.x - worldX, b.y, b.z - worldZ), "leaves");
        }
      }
    }
  }

  const voxelMapEntries = Array.from(voxelMap.entries()) as Array<
    [number, BlockType]
  >;
  const positionsByType = buildPositionsByType(worldX, worldZ, voxelMapEntries);
  const blockPositionsByType = new Map<BlockType, BlockPos[]>();
  group.userData = { chunkKeyNum: keyNum, cx: chunkX, cz: chunkZ };
  for (const [blockType, positions] of positionsByType) {
    const visible = filterVisibleBlocks(worldX, worldZ, voxelMap, positions);
    blockPositionsByType.set(blockType, visible);
    const mesh = addInstancedLayer(
      group,
      visible,
      getMaterialForBlockType(blockType),
      {
        chunkKeyNum: keyNum,
        blockType,
      }
    );
    if (
      mesh &&
      (blockType === "grass" || blockType === "grass_savanna") &&
      ctx.grassColormapData
    ) {
      setGrassInstanceColors(
        mesh,
        visible,
        getResolvedBiome,
        ctx.grassColormapData
      );
    }
    if (
      mesh &&
      FOLIAGE_BLOCK_TYPES.includes(blockType) &&
      ctx.foliageColormapData
    ) {
      setFoliageInstanceColors(
        mesh,
        visible,
        getResolvedBiome,
        ctx.foliageColormapData
      );
    }
  }

  const tallGrassPositions = getTallGrassPositions(
    worldX,
    worldZ,
    voxelMap,
    blockPositionsByType
  );
  if (ctx.tallGrassMaterial && tallGrassPositions.length > 0) {
    const tallGrassMesh = addTallGrassLayer(
      group,
      tallGrassPositions,
      ctx.tallGrassMaterial
    );
    if (tallGrassMesh && ctx.grassColormapData) {
      setGrassInstanceColors(
        tallGrassMesh,
        tallGrassPositions,
        getResolvedBiome,
        ctx.grassColormapData
      );
    }
  }

  const waterGeo = buildChunkWaterGeometry(worldX, worldZ, heightmap);
  if (waterGeo) {
    const waterMesh = new THREE.Mesh(
      waterGeo,
      getMaterialForBlockType("water")
    );
    waterMesh.castShadow = false;
    waterMesh.receiveShadow = true;
    waterMesh.renderOrder = 2;
    waterMesh.frustumCulled = true;
    group.add(waterMesh);
  }

  ctx.scene.add(group);
  const data: ChunkData = {
    group,
    cx: chunkX,
    cz: chunkZ,
    voxelMap,
    blockPositionsByType,
  };
  chunks.set(keyNum, data);
  ctx.raycastMeshCache.markDirty();
  ctx.frustumDirty = true;
  return data;
}

export function getRaycastMeshes(
  raycastMeshCache: RaycastMeshCache
): Array<THREE.InstancedMesh | THREE.Mesh> {
  return raycastMeshCache.get(chunks);
}

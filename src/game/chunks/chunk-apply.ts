import * as THREE from "three";
import type { BlockPos, BlockType, ChunkData } from "../../types";
import type { ChunkDataPayload } from "../../terrain-core";
import { CHUNK_SIZE, WATER_BLOCK_HEIGHT, WATER_LEVEL, WATER_PLANE_Y_OFFSET, WORLD_HEIGHT } from "../../constants";
import { decodeLocalKey, localKey, chunkKeyNumeric } from "../../chunk-runtime";
import { sharedBlockGeometry, sharedTallGrassGeometry, FOLIAGE_BLOCK_TYPES, getMaterialForBlockType, setFoliageInstanceColors, setGrassInstanceColors } from "../../block-materials";
import { isSolidBlock as isBlockTypeSolid } from "../../block-registry";
import { filterVisibleBlocks } from "./visible-blocks";
import type { Biome } from "../../game-terrain";

export type ChunkApplyDeps = {
  chunks: Map<number, ChunkData>;
  pendingChunkKeys: Set<number>;
  grassColormapData: ImageData | null;
  foliageColormapData: ImageData | null;
  tallGrassMaterial: THREE.MeshStandardMaterial | null;
  getResolvedBiome: (x: number, z: number) => Biome;
  onChunkAdded?: (data: ChunkData) => void;
  onChunkChanged?: () => void;
};

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();

function hasVertexColorsEnabled(material: THREE.Material | THREE.Material[]): boolean {
  if (Array.isArray(material)) {
    return material.some((m) => m instanceof THREE.MeshStandardMaterial && m.vertexColors);
  }
  return material instanceof THREE.MeshStandardMaterial && material.vertexColors;
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

function addInstancedLayer(
  group: THREE.Group,
  positions: BlockPos[],
  material: THREE.Material | THREE.Material[],
  userData?: { chunkKeyNum: number; blockType: BlockType }
): THREE.InstancedMesh | null {
  const count = positions.length;
  if (count === 0) return null;
  const mesh = new THREE.InstancedMesh(sharedBlockGeometry, material as THREE.Material, count);
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

function buildPositionsByType(
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

const GRASS_BLOCK_TYPES_FOR_TALL_GRASS: BlockType[] = ["grass", "grass_savanna"];
const TALL_GRASS_SPAWN_CHANCE = 0.05;
const TALL_GRASS_Y_OFFSET = -0.02;

function pseudoRandomFromBlockPos(seed: number, x: number, y: number, z: number): number {
  let h = seed >>> 0;
  h ^= Math.imul((x | 0) >>> 0, 374761393);
  h = (h << 13) | (h >>> 19);
  h ^= Math.imul((y | 0) >>> 0, 668265263);
  h = (h << 11) | (h >>> 21);
  h ^= Math.imul((z | 0) >>> 0, 2147483647);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h >>> 0) & 0xffffffff) / 0x100000000;
}

function getTallGrassPositions(
  seed: number,
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
      if (pseudoRandomFromBlockPos(seed, p.x, p.y, p.z) > TALL_GRASS_SPAWN_CHANCE) continue;
      out.push(p);
    }
  }
  return out;
}

function addTallGrassLayer(
  group: THREE.Group,
  positions: BlockPos[],
  material: THREE.MeshStandardMaterial
): THREE.InstancedMesh | null {
  if (positions.length === 0) return null;
  const mesh = new THREE.InstancedMesh(sharedTallGrassGeometry, material, positions.length);
  mesh.count = positions.length;
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    _position.set(p.x + 0.5, p.y + 0.5 + TALL_GRASS_Y_OFFSET, p.z + 0.5);
    _matrix.makeTranslation(_position.x, _position.y, _position.z);
    mesh.setMatrixAt(i, _matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  ensureWhiteInstanceColorsForVertexColorMaterial(mesh, material, positions.length);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function buildChunkWaterGeometry(worldX: number, worldZ: number, heightmap: number[][]): THREE.BufferGeometry | null {
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
      const topY = heightmap[lx][lz];
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

/**
 * Apply chunk data from the Web Worker to the scene (build meshes, ChunkData, add to chunks/scene).
 */
export function applyChunkPayload(
  scene: THREE.Scene,
  payload: ChunkDataPayload,
  deps: ChunkApplyDeps,
  worldSeed: number
): void {
  const keyNum = chunkKeyNumeric(payload.chunkX, payload.chunkZ);
  if (deps.chunks.has(keyNum)) return;

  const worldX = payload.chunkX * CHUNK_SIZE;
  const worldZ = payload.chunkZ * CHUNK_SIZE;
  const group = new THREE.Group();
  group.userData = { chunkKeyNum: keyNum, cx: payload.chunkX, cz: payload.chunkZ };

  const voxelMap = new Map<number, BlockType>();
  for (const [k, t] of payload.voxelMapEntries) voxelMap.set(k, t);

  const positionsByType = buildPositionsByType(worldX, worldZ, payload.voxelMapEntries);
  const blockPositionsByType = new Map<BlockType, BlockPos[]>();
  for (const [blockType, positions] of positionsByType) {
    const visible = filterVisibleBlocks({
      worldX,
      worldZ,
      chunkSize: CHUNK_SIZE,
      worldHeight: WORLD_HEIGHT,
      voxelMap,
      positions,
      localKey,
      isSolidBlock: isBlockTypeSolid,
    });
    blockPositionsByType.set(blockType, visible);
    const mesh = addInstancedLayer(group, visible, getMaterialForBlockType(blockType), {
      chunkKeyNum: keyNum,
      blockType,
    });
    if (mesh && (blockType === "grass" || blockType === "grass_savanna") && deps.grassColormapData) {
      setGrassInstanceColors(mesh, visible, deps.getResolvedBiome, deps.grassColormapData);
    }
    if (mesh && FOLIAGE_BLOCK_TYPES.includes(blockType) && deps.foliageColormapData) {
      setFoliageInstanceColors(mesh, visible, deps.getResolvedBiome, deps.foliageColormapData);
    }
  }

  const tallGrassPositions = getTallGrassPositions(
    worldSeed,
    worldX,
    worldZ,
    voxelMap,
    blockPositionsByType
  );
  if (deps.tallGrassMaterial && tallGrassPositions.length > 0) {
    const tallGrassMesh = addTallGrassLayer(group, tallGrassPositions, deps.tallGrassMaterial);
    if (tallGrassMesh && deps.grassColormapData) {
      setGrassInstanceColors(
        tallGrassMesh,
        tallGrassPositions,
        deps.getResolvedBiome,
        deps.grassColormapData
      );
    }
  }

  const waterGeo = buildChunkWaterGeometry(worldX, worldZ, payload.heightmap);
  if (waterGeo) {
    const waterMesh = new THREE.Mesh(waterGeo, getMaterialForBlockType("water"));
    waterMesh.castShadow = false;
    waterMesh.receiveShadow = true;
    waterMesh.renderOrder = 2;
    waterMesh.frustumCulled = true;
    group.add(waterMesh);
  }

  const data: ChunkData = {
    group,
    cx: payload.chunkX,
    cz: payload.chunkZ,
    voxelMap,
    blockPositionsByType,
  };
  deps.chunks.set(keyNum, data);
  scene.add(group);
  deps.onChunkAdded?.(data);
  deps.pendingChunkKeys.delete(keyNum);
  deps.onChunkChanged?.();
}


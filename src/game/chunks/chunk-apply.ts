import * as THREE from "three";
import type { BlockPos, BlockType, ChunkData } from "../../types";
import type { ChunkDataPayload } from "../../terrain-core";
import { idToType, CARVED_ID } from "../../terrain-core";
import { CHUNK_SIZE, WATER_BLOCK_HEIGHT, WATER_LEVEL, WATER_PLANE_Y_OFFSET, WORLD_HEIGHT } from "../../constants";
import { localKey, chunkKeyNumeric } from "../../chunk-runtime";
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

/** Decode flat voxel buffer into voxelMap (skips air and carved). */
export function buildVoxelMapFromBuffer(buffer: Uint8Array): Map<number, BlockType> {
  const voxelMap = new Map<number, BlockType>();
  for (let i = 0; i < buffer.length; i++) {
    const blockID = buffer[i];
    if (blockID === 0 || blockID === CARVED_ID) continue;
    const blockType = idToType(blockID) as BlockType;
    if (blockType === "air") continue;
    const lx = i % CHUNK_SIZE;
    const ly = Math.floor(i / CHUNK_SIZE) % WORLD_HEIGHT;
    const lz = Math.floor(i / (CHUNK_SIZE * WORLD_HEIGHT));
    const key = lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * WORLD_HEIGHT;
    voxelMap.set(key, blockType);
  }
  return voxelMap;
}

export function buildPositionsByTypeFromVisibleKeys(
  visible: NonNullable<ChunkDataPayload["visibleBlockKeysByType"]>,
  worldX: number,
  worldZ: number
): Map<BlockType, BlockPos[]> {
  const out = new Map<BlockType, BlockPos[]>();
  for (const entry of visible) {
    const blockType = idToType(entry.blockTypeId) as BlockType;
    if (blockType === "air") continue;
    const keys = entry.keys;
    const positions: BlockPos[] = new Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const lx = k % CHUNK_SIZE;
      const ly = Math.floor(k / CHUNK_SIZE) % WORLD_HEIGHT;
      const lz = Math.floor(k / (CHUNK_SIZE * WORLD_HEIGHT));
      positions[i] = { x: worldX + lx, y: ly, z: worldZ + lz };
    }
    out.set(blockType, positions);
  }
  return out;
}

function addGeometryLayerMesh(
  group: THREE.Group,
  layer: NonNullable<ChunkDataPayload["geometryLayers"]>[number],
  material: THREE.Material | THREE.Material[],
  userData?: { chunkKeyNum: number; blockType: BlockType }
): THREE.Mesh | null {
  const vertexCount = layer.position.length / 3;
  if (!Number.isFinite(vertexCount) || vertexCount <= 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(layer.position, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(layer.normal, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(layer.uv, 2));
  // Group ranges are in vertices for non-indexed BufferGeometry.
  // Worker face order [right, left, top, bottom, front, back] matches Three.js BoxGeometry
  // material indices 0..5, so faceIndex is used directly as materialIndex.
  let start = 0;
  for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
    const count = layer.faceVertexCounts[faceIndex] ?? 0;
    if (count > 0) geo.addGroup(start, count, faceIndex);
    start += count;
  }
  const mesh = new THREE.Mesh(geo, material as THREE.Material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (userData) mesh.userData = userData;
  group.add(mesh);
  return mesh;
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

export function getTallGrassPositions(
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
  const workerGrass = positionsByType.get("tall_grass" as BlockType);
  if (workerGrass) {
    for (const p of workerGrass) {
      out.push({ x: p.x, y: p.y - 1, z: p.z });
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

export function buildChunkWaterGeometry(
  worldX: number,
  worldZ: number,
  heightmap: number[][] | Float32Array
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
      const topY = Array.isArray(heightmap) ? heightmap[lx][lz] : heightmap[lx + lz * CHUNK_SIZE];
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

  const voxelMap = buildVoxelMapFromBuffer(payload.buffer);

  const blockPositionsByType =
    payload.visibleBlockKeysByType
      ? buildPositionsByTypeFromVisibleKeys(payload.visibleBlockKeysByType, worldX, worldZ)
      : new Map<BlockType, BlockPos[]>();

  if (payload.geometryLayers && payload.geometryLayers.length > 0) {
    for (const layer of payload.geometryLayers) {
      const blockType = idToType(layer.blockTypeId) as BlockType;
      if (blockType === "air") continue;
      // Keep instancing path for blocks that rely on per-instance colormap tint.
      if (blockType === "grass" || blockType === "grass_savanna" || FOLIAGE_BLOCK_TYPES.includes(blockType)) {
        continue;
      }
      addGeometryLayerMesh(group, layer, getMaterialForBlockType(blockType), { chunkKeyNum: keyNum, blockType });
    }
  }

  // Fallback / special-case instancing (colormap tint, or if no worker geometry available).
  if (!payload.geometryLayers || payload.geometryLayers.length === 0 || blockPositionsByType.size > 0) {
    const positionsSource =
      blockPositionsByType.size > 0
        ? blockPositionsByType
        : (() => {
            const positionsByType = new Map<BlockType, BlockPos[]>();
            for (let i = 0; i < payload.buffer.length; i++) {
              const blockID = payload.buffer[i];
              if (blockID === 0 || blockID === CARVED_ID) continue;
              const blockType = idToType(blockID) as BlockType;
              if (blockType === "air") continue;
              const lx = i % CHUNK_SIZE;
              const ly = Math.floor(i / CHUNK_SIZE) % WORLD_HEIGHT;
              const lz = Math.floor(i / (CHUNK_SIZE * WORLD_HEIGHT));
              const pos: BlockPos = { x: worldX + lx, y: ly, z: worldZ + lz };
              const arr = positionsByType.get(blockType) ?? [];
              arr.push(pos);
              positionsByType.set(blockType, arr);
            }
            return positionsByType;
          })();

    for (const [blockType, positions] of positionsSource) {
      let visible = positions;
      if (!payload.visibleBlockKeysByType) {
        visible = filterVisibleBlocks({
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
      blockPositionsByType.set(blockType, visible);
      if (payload.geometryLayers && payload.geometryLayers.length > 0) {
        // Only instance tinted blocks when worker geometry is present.
        if (!(blockType === "grass" || blockType === "grass_savanna" || FOLIAGE_BLOCK_TYPES.includes(blockType))) {
          continue;
        }
      }
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

  const waterSource = payload.heightmapBuffer ?? payload.heightmap;
  const waterGeo = waterSource ? buildChunkWaterGeometry(worldX, worldZ, waterSource) : null;
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


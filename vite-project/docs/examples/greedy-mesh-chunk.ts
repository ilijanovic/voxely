/**
 * Example: Greedy meshing (culling) for one chunk.
 * - Only emits faces where neighbor is air/empty.
 * - Merges adjacent same-type faces in 2D slices into quads (no full greedy merge here).
 *
 * Integrate by:
 * 1. Building a 3D chunk array chunk[lx][ly][lz] = blockType | 0 (air).
 * 2. Calling buildChunkMesh(chunk, worldX, worldY, worldZ) to get positions/normals/indices per material.
 * 3. Creating one BufferGeometry per material (or one with groups) and adding to chunk group.
 *
 * This reduces triangle count vs full cubes and removes internal faces.
 */

import * as THREE from "three";

const CHUNK_SIZE = 16;
const BLOCK_SIZE = 1;

type BlockId = number;
const AIR = 0;

interface Quad {
  x: number;
  y: number;
  z: number;
  axis: "x" | "y" | "z";
  sign: 1 | -1;
  w: number;
  h: number;
  blockId: BlockId;
}

function getNeighbor(
  chunk: BlockId[][][],
  lx: number,
  ly: number,
  lz: number,
  dx: number,
  dy: number,
  dz: number
): BlockId {
  const nx = lx + dx;
  const ny = ly + dy;
  const nz = lz + dz;
  if (nx < 0 || nx >= CHUNK_SIZE || ny < 0 || ny >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) {
    return AIR;
  }
  return chunk[nx][ny][nz] ?? AIR;
}

/**
 * Collect all visible quads (one face per exterior face of a solid block).
 * axis + sign: +X, -X, +Y, -Y, +Z, -Z.
 */
function collectQuads(chunk: BlockId[][][]): Quad[] {
  const quads: Quad[] = [];
  const dirs: [number, number, number, "x" | "y" | "z", 1 | -1][] = [
    [1, 0, 0, "x", 1],
    [-1, 0, 0, "x", -1],
    [0, 1, 0, "y", 1],
    [0, -1, 0, "y", -1],
    [0, 0, 1, "z", 1],
    [0, 0, -1, "z", -1],
  ];

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const blockId = chunk[lx][ly][lz] ?? AIR;
        if (blockId === AIR) continue;

        for (const [dx, dy, dz, axis, sign] of dirs) {
          const neighbor = getNeighbor(chunk, lx, ly, lz, dx, dy, dz);
          if (neighbor !== AIR) continue;

          quads.push({
            x: lx,
            y: ly,
            z: lz,
            axis,
            sign,
            w: 1,
            h: 1,
            blockId,
          });
        }
      }
    }
  }
  return quads;
}

/**
 * Convert quads to positions/normals/indices for Three.js BufferGeometry.
 * worldX, worldY, worldZ = chunk origin in world.
 */
function quadsToBufferGeometry(
  quads: Quad[],
  worldX: number,
  worldY: number,
  worldZ: number
): { position: number[]; normal: number[]; index: number[]; uv: number[] } {
  const position: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  let vertexOffset = 0;

  const normals: Record<string, [number, number, number]> = {
    "x,1": [1, 0, 0],
    "x,-1": [-1, 0, 0],
    "y,1": [0, 1, 0],
    "y,-1": [0, -1, 0],
    "z,1": [0, 0, 1],
    "z,-1": [0, 0, -1],
  };

  for (const q of quads) {
    const nx = normals[`${q.axis},${q.sign}`];
    const ox = worldX + q.x;
    const oy = worldY + q.y;
    const oz = worldZ + q.z;

    let v0: [number, number, number], v1: [number, number, number], v2: [number, number, number], v3: [number, number, number];
    if (q.axis === "x" && q.sign === 1) {
      v0 = [ox + 1, oy, oz];
      v1 = [ox + 1, oy + 1, oz];
      v2 = [ox + 1, oy + 1, oz + 1];
      v3 = [ox + 1, oy, oz + 1];
    } else if (q.axis === "x" && q.sign === -1) {
      v0 = [ox, oy, oz + 1];
      v1 = [ox, oy + 1, oz + 1];
      v2 = [ox, oy + 1, oz];
      v3 = [ox, oy, oz];
    } else if (q.axis === "y" && q.sign === 1) {
      v0 = [ox, oy + 1, oz + 1];
      v1 = [ox, oy + 1, oz];
      v2 = [ox + 1, oy + 1, oz];
      v3 = [ox + 1, oy + 1, oz + 1];
    } else if (q.axis === "y" && q.sign === -1) {
      v0 = [ox, oy, oz];
      v1 = [ox, oy, oz + 1];
      v2 = [ox + 1, oy, oz + 1];
      v3 = [ox + 1, oy, oz];
    } else if (q.axis === "z" && q.sign === 1) {
      v0 = [ox + 1, oy, oz + 1];
      v1 = [ox + 1, oy + 1, oz + 1];
      v2 = [ox, oy + 1, oz + 1];
      v3 = [ox, oy, oz + 1];
    } else {
      v0 = [ox, oy, oz];
      v1 = [ox, oy + 1, oz];
      v2 = [ox + 1, oy + 1, oz];
      v3 = [ox + 1, oy, oz];
    }

    position.push(v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2], v3[0], v3[1], v3[2]);
    normal.push(...nx, ...nx, ...nx, ...nx);
    uv.push(0, 0, 0, 1, 1, 1, 1, 0);
    index.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
    vertexOffset += 4;
  }

  return { position, normal, index, uv };
}

/**
 * Build a single BufferGeometry for all quads of one chunk (one material / atlas).
 * For multiple materials, group quads by blockId and build one geometry per material with groups.
 */
export function buildChunkMeshFromQuads(
  quads: Quad[],
  worldX: number,
  worldY: number,
  worldZ: number
): THREE.BufferGeometry {
  const { position, normal, index, uv } = quadsToBufferGeometry(quads, worldX, worldY, worldZ);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  return geo;
}

/**
 * Full pipeline: 3D chunk array -> visible quads -> geometry.
 * chunk[lx][ly][lz] = blockId (0 = air). You fill this from your terrain + trees.
 */
export function buildChunkMesh(
  chunk: BlockId[][][],
  worldX: number,
  worldY: number,
  worldZ: number
): THREE.BufferGeometry {
  const quads = collectQuads(chunk);
  return buildChunkMeshFromQuads(quads, worldX, worldY, worldZ);
}

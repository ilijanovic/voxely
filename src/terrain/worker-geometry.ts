import { CHUNK_SIZE, WORLD_HEIGHT } from "../constants";
import { CARVED_ID } from "./block-ids";

type FaceIndex = 0 | 1 | 2 | 3 | 4 | 5; // [right, left, top, bottom, front, back]

export type GeometryLayer = {
  blockTypeId: number;
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  faceVertexCounts: Uint32Array;
};

export type VisibleKeysLayer = { blockTypeId: number; keys: Uint32Array };

const STRIDE_Y = CHUNK_SIZE;
const STRIDE_Z = CHUNK_SIZE * WORLD_HEIGHT;

function isEmpty(id: number): boolean {
  return id === 0 || id === CARVED_ID;
}

function getNeighborId(buffer: Uint8Array, i: number, lx: number, ly: number, lz: number, face: FaceIndex): number {
  switch (face) {
    case 0: // +X
      return lx + 1 < CHUNK_SIZE ? buffer[i + 1] : 0;
    case 1: // -X
      return lx - 1 >= 0 ? buffer[i - 1] : 0;
    case 2: // +Y
      return ly + 1 < WORLD_HEIGHT ? buffer[i + STRIDE_Y] : 0;
    case 3: // -Y
      return ly - 1 >= 0 ? buffer[i - STRIDE_Y] : 0;
    case 4: // +Z
      return lz + 1 < CHUNK_SIZE ? buffer[i + STRIDE_Z] : 0;
    case 5: // -Z
      return lz - 1 >= 0 ? buffer[i - STRIDE_Z] : 0;
  }
}

function writeFaceNonIndexed(
  face: FaceIndex,
  x: number,
  y: number,
  z: number,
  pos: Float32Array,
  nor: Float32Array,
  uv: Float32Array,
  vtxCursor: number
): void {
  // 6 vertices (2 triangles) per face
  // UV quad: (0,0)-(1,1)
  // Winding is counter-clockwise as seen from outside.
  let nx = 0, ny = 0, nz = 0;
  let ax = 0, ay = 0, az = 0;
  let bx = 0, by = 0, bz = 0;
  let cx = 0, cy = 0, cz = 0;
  let dx = 0, dy = 0, dz = 0;

  switch (face) {
    case 0: // +X (right)
      nx = 1;
      ax = x + 1; ay = y;     az = z;
      bx = x + 1; by = y + 1; bz = z;
      cx = x + 1; cy = y + 1; cz = z + 1;
      dx = x + 1; dy = y;     dz = z + 1;
      break;
    case 1: // -X (left)
      nx = -1;
      ax = x; ay = y;     az = z + 1;
      bx = x; by = y + 1; bz = z + 1;
      cx = x; cy = y + 1; cz = z;
      dx = x; dy = y;     dz = z;
      break;
    case 2: // +Y (top)
      ny = 1;
      ax = x;     ay = y + 1; az = z + 1;
      bx = x + 1; by = y + 1; bz = z + 1;
      cx = x + 1; cy = y + 1; cz = z;
      dx = x;     dy = y + 1; dz = z;
      break;
    case 3: // -Y (bottom)
      ny = -1;
      ax = x;     ay = y; az = z;
      bx = x + 1; by = y; bz = z;
      cx = x + 1; cy = y; cz = z + 1;
      dx = x;     dy = y; dz = z + 1;
      break;
    case 4: // +Z (front)
      nz = 1;
      ax = x + 1; ay = y;     az = z + 1;
      bx = x + 1; by = y + 1; bz = z + 1;
      cx = x;     cy = y + 1; cz = z + 1;
      dx = x;     dy = y;     dz = z + 1;
      break;
    case 5: // -Z (back)
      nz = -1;
      ax = x;     ay = y;     az = z;
      bx = x;     by = y + 1; bz = z;
      cx = x + 1; cy = y + 1; cz = z;
      dx = x + 1; dy = y;     dz = z;
      break;
  }

  // Tri 1: a, b, c  | Tri 2: a, c, d
  const v = vtxCursor;
  const p0 = v * 3;
  const n0 = v * 3;
  const t0 = v * 2;

  // a
  pos[p0] = ax; pos[p0 + 1] = ay; pos[p0 + 2] = az;
  nor[n0] = nx; nor[n0 + 1] = ny; nor[n0 + 2] = nz;
  uv[t0] = 0; uv[t0 + 1] = 0;
  // b
  pos[p0 + 3] = bx; pos[p0 + 4] = by; pos[p0 + 5] = bz;
  nor[n0 + 3] = nx; nor[n0 + 4] = ny; nor[n0 + 5] = nz;
  uv[t0 + 2] = 1; uv[t0 + 3] = 0;
  // c
  pos[p0 + 6] = cx; pos[p0 + 7] = cy; pos[p0 + 8] = cz;
  nor[n0 + 6] = nx; nor[n0 + 7] = ny; nor[n0 + 8] = nz;
  uv[t0 + 4] = 1; uv[t0 + 5] = 1;

  // a
  pos[p0 + 9] = ax; pos[p0 + 10] = ay; pos[p0 + 11] = az;
  nor[n0 + 9] = nx; nor[n0 + 10] = ny; nor[n0 + 11] = nz;
  uv[t0 + 6] = 0; uv[t0 + 7] = 0;
  // c
  pos[p0 + 12] = cx; pos[p0 + 13] = cy; pos[p0 + 14] = cz;
  nor[n0 + 12] = nx; nor[n0 + 13] = ny; nor[n0 + 14] = nz;
  uv[t0 + 8] = 1; uv[t0 + 9] = 1;
  // d
  pos[p0 + 15] = dx; pos[p0 + 16] = dy; pos[p0 + 17] = dz;
  nor[n0 + 15] = nx; nor[n0 + 16] = ny; nor[n0 + 17] = nz;
  uv[t0 + 10] = 0; uv[t0 + 11] = 1;
}

export function buildWorkerGeometryFromVoxelBuffer(options: {
  buffer: Uint8Array;
  worldX: number;
  worldZ: number;
}): { geometryLayers: GeometryLayer[]; visibleBlockKeysByType: VisibleKeysLayer[] } {
  const { buffer, worldX, worldZ } = options;

  // First pass: count visible faces and visible blocks per type.
  const faceCountsByType = new Map<number, Uint32Array>(); // id -> 6 counts
  const visibleBlockCountsByType = new Map<number, number>(); // id -> count

  for (let i = 0; i < buffer.length; i++) {
    const id = buffer[i];
    if (isEmpty(id)) continue;
    const lx = i % CHUNK_SIZE;
    const ly = Math.floor(i / CHUNK_SIZE) % WORLD_HEIGHT;
    const lz = Math.floor(i / STRIDE_Z);

    let anyVisible = false;
    let faceCounts = faceCountsByType.get(id);
    if (!faceCounts) {
      faceCounts = new Uint32Array(6);
      faceCountsByType.set(id, faceCounts);
    }

    for (let f: FaceIndex = 0 as FaceIndex; f < 6; f = (f + 1) as FaceIndex) {
      const nid = getNeighborId(buffer, i, lx, ly, lz, f);
      if (isEmpty(nid)) {
        faceCounts[f] += 1;
        anyVisible = true;
      }
    }

    if (anyVisible) {
      visibleBlockCountsByType.set(id, (visibleBlockCountsByType.get(id) ?? 0) + 1);
    }
  }

  // Allocate output buffers per type.
  const writeStateByType = new Map<
    number,
    {
      layer: GeometryLayer;
      faceVertexStarts: Uint32Array; // 6
      faceVertexCursors: Uint32Array; // 6
      keys: Uint32Array;
      keyCursor: number;
    }
  >();

  for (const [id, faceCounts] of faceCountsByType) {
    const faceVertexCounts = new Uint32Array(6);
    let totalVertices = 0;
    for (let f = 0; f < 6; f++) {
      const vtx = faceCounts[f] * 6;
      faceVertexCounts[f] = vtx;
      totalVertices += vtx;
    }
    const position = new Float32Array(totalVertices * 3);
    const normal = new Float32Array(totalVertices * 3);
    const uv = new Float32Array(totalVertices * 2);

    const faceVertexStarts = new Uint32Array(6);
    let running = 0;
    for (let f = 0; f < 6; f++) {
      faceVertexStarts[f] = running;
      running += faceVertexCounts[f];
    }

    const visibleBlocks = visibleBlockCountsByType.get(id) ?? 0;
    const keys = new Uint32Array(visibleBlocks);

    writeStateByType.set(id, {
      layer: { blockTypeId: id, position, normal, uv, faceVertexCounts },
      faceVertexStarts,
      faceVertexCursors: new Uint32Array(6),
      keys,
      keyCursor: 0,
    });
  }

  // Second pass: write geometry and visible keys.
  for (let i = 0; i < buffer.length; i++) {
    const id = buffer[i];
    if (isEmpty(id)) continue;

    const state = writeStateByType.get(id);
    if (!state) continue;

    const lx = i % CHUNK_SIZE;
    const ly = Math.floor(i / CHUNK_SIZE) % WORLD_HEIGHT;
    const lz = Math.floor(i / STRIDE_Z);

    const x = worldX + lx;
    const y = ly;
    const z = worldZ + lz;

    let anyVisible = false;
    for (let f: FaceIndex = 0 as FaceIndex; f < 6; f = (f + 1) as FaceIndex) {
      const nid = getNeighborId(buffer, i, lx, ly, lz, f);
      if (!isEmpty(nid)) continue;
      anyVisible = true;
      const baseVertex =
        state.faceVertexStarts[f] + state.faceVertexCursors[f];
      writeFaceNonIndexed(f, x, y, z, state.layer.position, state.layer.normal, state.layer.uv, baseVertex);
      state.faceVertexCursors[f] += 6;
    }

    if (anyVisible && state.keyCursor < state.keys.length) {
      state.keys[state.keyCursor++] = i;
    }
  }

  const geometryLayers: GeometryLayer[] = [];
  const visibleBlockKeysByType: VisibleKeysLayer[] = [];
  for (const { layer, keys, keyCursor } of writeStateByType.values()) {
    geometryLayers.push(layer);
    visibleBlockKeysByType.push({
      blockTypeId: layer.blockTypeId,
      keys: keyCursor === keys.length ? keys : keys.subarray(0, keyCursor),
    });
  }

  return { geometryLayers, visibleBlockKeysByType };
}


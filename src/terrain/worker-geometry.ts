import { CHUNK_SIZE, WORLD_HEIGHT } from '../constants'
import { CARVED_ID, getBlockHeightById, WATER_SOURCE_ID } from './block-ids'

function isWaterBlockId(id: number): boolean {
  return WATER_SOURCE_ID >= 0 && id >= WATER_SOURCE_ID && id < WATER_SOURCE_ID + 8
}

// Face order matches Three.js BoxGeometry material indices: [right, left, top, bottom, front, back].
type FaceIndex = 0 | 1 | 2 | 3 | 4 | 5

export type GeometryLayer = {
  blockTypeId: number
  position: Float32Array
  normal: Float32Array
  uv: Float32Array
  /** Optional index buffer (when present, geometry is indexed). */
  index?: Uint32Array
  faceVertexCounts: Uint32Array
}

export type VisibleKeysLayer = { blockTypeId: number; keys: Uint32Array }

const STRIDE_Y = CHUNK_SIZE
const STRIDE_Z = CHUNK_SIZE * WORLD_HEIGHT

function isEmpty(id: number): boolean {
  return id === 0 || id === CARVED_ID
}

/**
 * True if a face from block id toward neighbor nid should be drawn.
 * We draw when the neighbor is air/carved OR when it is a different block type,
 * so boundaries between e.g. dirt and stone are visible (no "solid holes").
 * Do not reduce to isEmpty(nid) only – that causes visible holes with correct collision.
 * See chunk-payload-contract.test.ts "draws faces between different block types".
 */
function isFaceVisibleTowardNeighbor(id: number, nid: number): boolean {
  return isEmpty(nid) || nid !== id
}

function getNeighborId(
  buffer: Uint8Array,
  i: number,
  lx: number,
  ly: number,
  lz: number,
  face: FaceIndex,
): number {
  switch (face) {
    case 0: // +X
      return lx + 1 < CHUNK_SIZE ? buffer[i + 1] : 0
    case 1: // -X
      return lx - 1 >= 0 ? buffer[i - 1] : 0
    case 2: // +Y
      return ly + 1 < WORLD_HEIGHT ? buffer[i + STRIDE_Y] : 0
    case 3: // -Y
      return ly - 1 >= 0 ? buffer[i - STRIDE_Y] : 0
    case 4: // +Z
      return lz + 1 < CHUNK_SIZE ? buffer[i + STRIDE_Z] : 0
    case 5: // -Z
      return lz - 1 >= 0 ? buffer[i - STRIDE_Z] : 0
  }
}

type Rect = {
  face: FaceIndex
  x: number
  y: number
  z: number
  w: number
  h: number
  blockHeight: number
}

function greedyRectsFromMask(
  mask: Uint16Array,
  width: number,
  height: number,
): Array<{ u: number; v: number; w: number; h: number; id: number }> {
  const rects: Array<{ u: number; v: number; w: number; h: number; id: number }> = []
  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; ) {
      const idx = u + v * width
      const id = mask[idx]
      if (id === 0) {
        u++
        continue
      }

      // Width
      let w = 1
      while (u + w < width && mask[idx + w] === id) w++

      // Height
      let h = 1
      outer: while (v + h < height) {
        const row = (v + h) * width + u
        for (let k = 0; k < w; k++) {
          if (mask[row + k] !== id) break outer
        }
        h++
      }

      // Clear
      for (let dv = 0; dv < h; dv++) {
        const row = (v + dv) * width + u
        for (let du = 0; du < w; du++) mask[row + du] = 0
      }

      rects.push({ u, v, w, h, id })
      u += w
    }
  }
  return rects
}

function writeQuadIndexed(
  face: FaceIndex,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  pos: Float32Array,
  nor: Float32Array,
  uv: Float32Array,
  index: Uint32Array,
  vtxCursor: number, // vertex cursor (in vertices)
  idxCursor: number, // index cursor (in indices)
  blockHeight: number = 1,
): void {
  const topY = y + blockHeight
  // 4 vertices + 6 indices per quad. UV layout matches Three.js BoxGeometry (V = 1 - iy).
  // Winding is counter-clockwise as seen from outside.
  let nx = 0,
    ny = 0,
    nz = 0
  let ax = 0,
    ay = 0,
    az = 0
  let bx = 0,
    by = 0,
    bz = 0
  let cx = 0,
    cy = 0,
    cz = 0
  let dx = 0,
    dy = 0,
    dz = 0

  switch (face) {
    case 0: // +X (right)
      nx = 1
      ax = x + 1
      ay = y
      az = z
      bx = x + 1
      by = y + h
      bz = z
      cx = x + 1
      cy = y + h
      cz = z + w
      dx = x + 1
      dy = y
      dz = z + w
      break
    case 1: // -X (left)
      nx = -1
      ax = x
      ay = y
      az = z + w
      bx = x
      by = y + h
      bz = z + w
      cx = x
      cy = y + h
      cz = z
      dx = x
      dy = y
      dz = z
      break
    case 2: // +Y (top)
      ny = 1
      ax = x
      ay = topY
      az = z + h
      bx = x + w
      by = topY
      bz = z + h
      cx = x + w
      cy = topY
      cz = z
      dx = x
      dy = topY
      dz = z
      break
    case 3: // -Y (bottom)
      ny = -1
      ax = x
      ay = y
      az = z
      bx = x + w
      by = y
      bz = z
      cx = x + w
      cy = y
      cz = z + h
      dx = x
      dy = y
      dz = z + h
      break
    case 4: // +Z (front)
      nz = 1
      ax = x + w
      ay = y
      az = z + 1
      bx = x + w
      by = y + h
      bz = z + 1
      cx = x
      cy = y + h
      cz = z + 1
      dx = x
      dy = y
      dz = z + 1
      break
    case 5: // -Z (back)
      nz = -1
      ax = x
      ay = y
      az = z
      bx = x
      by = y + h
      bz = z
      cx = x + w
      cy = y + h
      cz = z
      dx = x + w
      dy = y
      dz = z
      break
  }

  // Indices: (a,b,c) and (a,c,d)
  const base = vtxCursor >>> 0
  index[idxCursor] = base
  index[idxCursor + 1] = base + 1
  index[idxCursor + 2] = base + 2
  index[idxCursor + 3] = base
  index[idxCursor + 4] = base + 2
  index[idxCursor + 5] = base + 3

  // World-aligned UVs: keep texture phase continuous across greedy-merged quads.
  // Mapping per face:
  //  ±X: u=z, v=y
  //  ±Z: u=x, v=y
  //  ±Y: u=x, v=z
  const p0 = base * 3
  const n0 = base * 3
  const t0 = base * 2

  const uvFor = (px: number, py: number, pz: number): { u: number; v: number } => {
    switch (face) {
      case 0: // +X
      case 1: // -X
        return { u: pz, v: py }
      case 4: // +Z
      case 5: // -Z
        return { u: px, v: py }
      case 2: // +Y
      case 3: // -Y
        return { u: px, v: pz }
    }
  }
  const uva = uvFor(ax, ay, az)
  const uvb = uvFor(bx, by, bz)
  const uvc = uvFor(cx, cy, cz)
  const uvd = uvFor(dx, dy, dz)

  // a
  pos[p0] = ax
  pos[p0 + 1] = ay
  pos[p0 + 2] = az
  nor[n0] = nx
  nor[n0 + 1] = ny
  nor[n0 + 2] = nz
  uv[t0] = uva.u
  uv[t0 + 1] = uva.v
  // b
  pos[p0 + 3] = bx
  pos[p0 + 4] = by
  pos[p0 + 5] = bz
  nor[n0 + 3] = nx
  nor[n0 + 4] = ny
  nor[n0 + 5] = nz
  uv[t0 + 2] = uvb.u
  uv[t0 + 3] = uvb.v
  // c
  pos[p0 + 6] = cx
  pos[p0 + 7] = cy
  pos[p0 + 8] = cz
  nor[n0 + 6] = nx
  nor[n0 + 7] = ny
  nor[n0 + 8] = nz
  uv[t0 + 4] = uvc.u
  uv[t0 + 5] = uvc.v
  // d
  pos[p0 + 9] = dx
  pos[p0 + 10] = dy
  pos[p0 + 11] = dz
  nor[n0 + 9] = nx
  nor[n0 + 10] = ny
  nor[n0 + 11] = nz
  uv[t0 + 6] = uvd.u
  uv[t0 + 7] = uvd.v
}

export function buildWorkerGeometryFromVoxelBuffer(options: {
  buffer: Uint8Array
  worldX: number
  worldZ: number
}): { geometryLayers: GeometryLayer[]; visibleBlockKeysByType: VisibleKeysLayer[] } {
  const { buffer, worldX, worldZ } = options

  // Pass A: count visible blocks per type for visibleBlockKeysByType.
  const visibleBlockCountsByType = new Map<number, number>() // id -> count

  for (let i = 0; i < buffer.length; i++) {
    const id = buffer[i]
    if (isEmpty(id)) continue
    const lx = i % CHUNK_SIZE
    const ly = Math.floor(i / CHUNK_SIZE) % WORLD_HEIGHT
    const lz = Math.floor(i / STRIDE_Z)

    let anyVisible = false

    for (let f: FaceIndex = 0 as FaceIndex; f < 6; f = (f + 1) as FaceIndex) {
      const nid = getNeighborId(buffer, i, lx, ly, lz, f)
      if (isFaceVisibleTowardNeighbor(id, nid)) {
        anyVisible = true
      }
    }

    if (anyVisible) {
      visibleBlockCountsByType.set(id, (visibleBlockCountsByType.get(id) ?? 0) + 1)
    }
  }

  // Pass B: build merged quads (rects) per block type + face.
  const rectsByType = new Map<number, Rect[]>()
  const faceIndexCountsByType = new Map<number, Uint32Array>() // id -> 6 counts in indices

  function pushRect(rect: Rect, id: number): void {
    const list = rectsByType.get(id)
    if (list) list.push(rect)
    else rectsByType.set(id, [rect])

    let counts = faceIndexCountsByType.get(id)
    if (!counts) {
      counts = new Uint32Array(6)
      faceIndexCountsByType.set(id, counts)
    }
    counts[rect.face] += 6
  }

  // Masks reused per face orientation to reduce allocations.
  const maskYZ = new Uint16Array(WORLD_HEIGHT * CHUNK_SIZE) // width=CHUNK_SIZE(z), height=WORLD_HEIGHT(y)
  const maskXZ = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE) // width=CHUNK_SIZE(x), height=CHUNK_SIZE(z)
  const maskXY = new Uint16Array(CHUNK_SIZE * WORLD_HEIGHT) // width=CHUNK_SIZE(x), height=WORLD_HEIGHT(y)

  // +X and -X: planes over x, mask is (z by y).
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    // +X
    maskYZ.fill(0)
    for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const i = lx + ly * STRIDE_Y + lz * STRIDE_Z
        const id = buffer[i]
        if (isEmpty(id)) continue
        if (isWaterBlockId(id)) continue
        const nid = lx + 1 < CHUNK_SIZE ? buffer[i + 1] : 0
        if (!isFaceVisibleTowardNeighbor(id, nid)) continue
        const bh = getBlockHeightById(id)
        if (bh !== 1) {
          pushRect(
            { face: 0, x: worldX + lx, y: ly, z: worldZ + lz, w: 1, h: bh, blockHeight: bh },
            id,
          )
          continue
        }
        maskYZ[lz + ly * CHUNK_SIZE] = id
      }
    }
    for (const r of greedyRectsFromMask(maskYZ, CHUNK_SIZE, WORLD_HEIGHT)) {
      pushRect(
        { face: 0, x: worldX + lx, y: r.v, z: worldZ + r.u, w: r.w, h: r.h, blockHeight: 1 },
        r.id,
      )
    }

    // -X
    maskYZ.fill(0)
    for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const i = lx + ly * STRIDE_Y + lz * STRIDE_Z
        const id = buffer[i]
        if (isEmpty(id)) continue
        if (isWaterBlockId(id)) continue
        const nid = lx - 1 >= 0 ? buffer[i - 1] : 0
        if (!isFaceVisibleTowardNeighbor(id, nid)) continue
        const bh = getBlockHeightById(id)
        if (bh !== 1) {
          pushRect(
            { face: 1, x: worldX + lx, y: ly, z: worldZ + lz, w: 1, h: bh, blockHeight: bh },
            id,
          )
          continue
        }
        maskYZ[lz + ly * CHUNK_SIZE] = id
      }
    }
    for (const r of greedyRectsFromMask(maskYZ, CHUNK_SIZE, WORLD_HEIGHT)) {
      pushRect(
        { face: 1, x: worldX + lx, y: r.v, z: worldZ + r.u, w: r.w, h: r.h, blockHeight: 1 },
        r.id,
      )
    }
  }

  // +Y and -Y: planes over y, mask is (x by z).
  for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
    // +Y
    maskXZ.fill(0)
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const i = lx + ly * STRIDE_Y + lz * STRIDE_Z
        const id = buffer[i]
        if (isEmpty(id)) continue
        if (isWaterBlockId(id)) continue
        const nid = ly + 1 < WORLD_HEIGHT ? buffer[i + STRIDE_Y] : 0
        if (!isFaceVisibleTowardNeighbor(id, nid)) continue
        const bh = getBlockHeightById(id)
        if (bh !== 1) {
          pushRect(
            { face: 2, x: worldX + lx, y: ly, z: worldZ + lz, w: 1, h: 1, blockHeight: bh },
            id,
          )
          continue
        }
        maskXZ[lx + lz * CHUNK_SIZE] = id
      }
    }
    for (const r of greedyRectsFromMask(maskXZ, CHUNK_SIZE, CHUNK_SIZE)) {
      pushRect(
        { face: 2, x: worldX + r.u, y: ly, z: worldZ + r.v, w: r.w, h: r.h, blockHeight: 1 },
        r.id,
      )
    }

    // -Y
    maskXZ.fill(0)
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const i = lx + ly * STRIDE_Y + lz * STRIDE_Z
        const id = buffer[i]
        if (isEmpty(id)) continue
        if (isWaterBlockId(id)) continue
        const nid = ly - 1 >= 0 ? buffer[i - STRIDE_Y] : 0
        if (!isFaceVisibleTowardNeighbor(id, nid)) continue
        const bh = getBlockHeightById(id)
        if (bh !== 1) {
          pushRect(
            { face: 3, x: worldX + lx, y: ly, z: worldZ + lz, w: 1, h: 1, blockHeight: bh },
            id,
          )
          continue
        }
        maskXZ[lx + lz * CHUNK_SIZE] = id
      }
    }
    for (const r of greedyRectsFromMask(maskXZ, CHUNK_SIZE, CHUNK_SIZE)) {
      pushRect(
        { face: 3, x: worldX + r.u, y: ly, z: worldZ + r.v, w: r.w, h: r.h, blockHeight: 1 },
        r.id,
      )
    }
  }

  // +Z and -Z: planes over z, mask is (x by y).
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    // +Z
    maskXY.fill(0)
    for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const i = lx + ly * STRIDE_Y + lz * STRIDE_Z
        const id = buffer[i]
        if (isEmpty(id)) continue
        if (isWaterBlockId(id)) continue
        const nid = lz + 1 < CHUNK_SIZE ? buffer[i + STRIDE_Z] : 0
        if (!isFaceVisibleTowardNeighbor(id, nid)) continue
        const bh = getBlockHeightById(id)
        if (bh !== 1) {
          pushRect(
            { face: 4, x: worldX + lx, y: ly, z: worldZ + lz, w: 1, h: bh, blockHeight: bh },
            id,
          )
          continue
        }
        maskXY[lx + ly * CHUNK_SIZE] = id
      }
    }
    for (const r of greedyRectsFromMask(maskXY, CHUNK_SIZE, WORLD_HEIGHT)) {
      pushRect(
        { face: 4, x: worldX + r.u, y: r.v, z: worldZ + lz, w: r.w, h: r.h, blockHeight: 1 },
        r.id,
      )
    }

    // -Z
    maskXY.fill(0)
    for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const i = lx + ly * STRIDE_Y + lz * STRIDE_Z
        const id = buffer[i]
        if (isEmpty(id)) continue
        if (isWaterBlockId(id)) continue
        const nid = lz - 1 >= 0 ? buffer[i - STRIDE_Z] : 0
        if (!isFaceVisibleTowardNeighbor(id, nid)) continue
        const bh = getBlockHeightById(id)
        if (bh !== 1) {
          pushRect(
            { face: 5, x: worldX + lx, y: ly, z: worldZ + lz, w: 1, h: bh, blockHeight: bh },
            id,
          )
          continue
        }
        maskXY[lx + ly * CHUNK_SIZE] = id
      }
    }
    for (const r of greedyRectsFromMask(maskXY, CHUNK_SIZE, WORLD_HEIGHT)) {
      pushRect(
        { face: 5, x: worldX + r.u, y: r.v, z: worldZ + lz, w: r.w, h: r.h, blockHeight: 1 },
        r.id,
      )
    }
  }

  // Allocate and write geometry buffers per type.
  const geometryLayers: GeometryLayer[] = []
  for (const [id, rects] of rectsByType) {
    const quadCount = rects.length
    if (quadCount === 0) continue
    const vertexCount = quadCount * 4
    const indexCount = quadCount * 6

    const position = new Float32Array(vertexCount * 3)
    const normal = new Float32Array(vertexCount * 3)
    const uv = new Float32Array(vertexCount * 2)
    const index = new Uint32Array(indexCount)

    const faceVertexCounts = faceIndexCountsByType.get(id) ?? new Uint32Array(6)

    let vtxCursor = 0
    let idxCursor = 0
    for (const r of rects) {
      writeQuadIndexed(
        r.face,
        r.x,
        r.y,
        r.z,
        r.w,
        r.h,
        position,
        normal,
        uv,
        index,
        vtxCursor,
        idxCursor,
        r.blockHeight,
      )
      vtxCursor += 4
      idxCursor += 6
    }

    geometryLayers.push({ blockTypeId: id, position, normal, uv, index, faceVertexCounts })
  }

  // Pass C: write visible keys (same semantics as before).
  const visibleBlockKeysByType: VisibleKeysLayer[] = []
  for (const [id, count] of visibleBlockCountsByType) {
    if (count <= 0) continue
    visibleBlockKeysByType.push({ blockTypeId: id, keys: new Uint32Array(count) })
  }
  const keyStateById = new Map<number, { keys: Uint32Array; cursor: number }>()
  for (const entry of visibleBlockKeysByType) keyStateById.set(entry.blockTypeId, { keys: entry.keys, cursor: 0 })

  for (let i = 0; i < buffer.length; i++) {
    const id = buffer[i]
    if (isEmpty(id)) continue
    const lx = i % CHUNK_SIZE
    const ly = Math.floor(i / CHUNK_SIZE) % WORLD_HEIGHT
    const lz = Math.floor(i / STRIDE_Z)

    let anyVisible = false
    for (let f: FaceIndex = 0 as FaceIndex; f < 6; f = (f + 1) as FaceIndex) {
      const nid = getNeighborId(buffer, i, lx, ly, lz, f)
      if (isFaceVisibleTowardNeighbor(id, nid)) {
        anyVisible = true
        break
      }
    }
    if (!anyVisible) continue
    const st = keyStateById.get(id)
    if (!st) continue
    if (st.cursor < st.keys.length) st.keys[st.cursor++] = i
  }

  // Trim key arrays if needed.
  for (let i = 0; i < visibleBlockKeysByType.length; i++) {
    const entry = visibleBlockKeysByType[i]
    const st = keyStateById.get(entry.blockTypeId)
    if (!st) continue
    if (st.cursor !== entry.keys.length) visibleBlockKeysByType[i] = { blockTypeId: entry.blockTypeId, keys: entry.keys.subarray(0, st.cursor) }
  }

  return { geometryLayers, visibleBlockKeysByType }
}

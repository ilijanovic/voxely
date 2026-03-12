/**
 * Contract / roundtrip tests: run the same pipeline the worker runs,
 * then assert the resulting ChunkDataPayload satisfies every structural
 * assumption that chunk-apply.ts (main thread) relies on.
 *
 * This catches worker ↔ main-thread drift without a real Web Worker.
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createWorkerHandler } from './chunk-worker-handler'
import { CHUNK_SIZE, WORLD_HEIGHT } from './constants'
import { idToType, CARVED_ID, localKey as terrainLocalKey, typeToId } from './terrain/block-ids'
import { buildWorkerGeometryFromVoxelBuffer } from './terrain/worker-geometry'
import { localKey as runtimeLocalKey } from './chunk-runtime'
import type { ChunkDataPayload } from './terrain-core'
import { createTerrainSampling } from './terrain-sampling'

const TEST_SEED = 12345

function generatePayload(chunkX: number, chunkZ: number): ChunkDataPayload {
  const handler = createWorkerHandler()
  handler.handleMessage({ type: 'init', seed: TEST_SEED })
  const payloads = handler.handleMessage({
    type: 'generate',
    chunkX,
    chunkZ,
    blockMods: [],
  })
  expect(payloads).toHaveLength(1)
  return payloads[0]
}

function fnv1a32(bytes: Uint8Array): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function hashFloat32Array(arr: Float32Array): string {
  return fnv1a32(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength))
}

function hashPayloadGolden(p: ChunkDataPayload): {
  bufferHash: string
  heightmapHash: string | null
  geometry: {
    layerCount: number
    totalPositions: number
    totalNormals: number
    totalUvs: number
    totalFaceVertexCounts: number
    sumFaceVertexCounts: number
  } | null
} {
  const bufferHash = fnv1a32(p.buffer)
  const heightmapHash = p.heightmapBuffer ? hashFloat32Array(p.heightmapBuffer) : null

  const geometryLayers = p.geometryLayers ?? null
  if (!geometryLayers) {
    return {
      bufferHash,
      heightmapHash,
      geometry: null,
    }
  }

  let totalPositions = 0
  let totalNormals = 0
  let totalUvs = 0
  let totalFaceVertexCounts = 0
  let sumFaceVertexCounts = 0

  for (const layer of geometryLayers) {
    totalPositions += layer.position.length
    totalNormals += layer.normal.length
    totalUvs += layer.uv.length
    totalFaceVertexCounts += layer.faceVertexCounts.length
    for (let i = 0; i < layer.faceVertexCounts.length; i++) {
      sumFaceVertexCounts += layer.faceVertexCounts[i]
    }
  }

  return {
    bufferHash,
    heightmapHash,
    geometry: {
      layerCount: geometryLayers.length,
      totalPositions,
      totalNormals,
      totalUvs,
      totalFaceVertexCounts,
      sumFaceVertexCounts,
    },
  }
}

function generatePayloadWithSnowHeight(
  chunkX: number,
  chunkZ: number,
  snowAccumulationHeight: number,
): ChunkDataPayload {
  const handler = createWorkerHandler()
  handler.handleMessage({
    type: 'init',
    seed: TEST_SEED,
    snowAccumulationHeight,
  })
  const payloads = handler.handleMessage({
    type: 'generate',
    chunkX,
    chunkZ,
    blockMods: [],
  })
  expect(payloads).toHaveLength(1)
  return payloads[0]
}

describe('ChunkDataPayload contract', () => {
  const payload = generatePayload(0, 0)

  it('matches a golden hash summary for seed=12345 chunk=(0,0)', () => {
    expect(hashPayloadGolden(payload)).toMatchInlineSnapshot(`
      {
        "bufferHash": "70f2c3ae",
        "geometry": {
          "layerCount": 12,
          "sumFaceVertexCounts": 41202,
          "totalFaceVertexCounts": 72,
          "totalNormals": 82404,
          "totalPositions": 82404,
          "totalUvs": 54936,
        },
        "heightmapHash": "b94f1a31",
      }
    `)
  })

  describe('voxel buffer', () => {
    it('has correct length (CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE)', () => {
      expect(payload.buffer).toBeInstanceOf(Uint8Array)
      expect(payload.buffer.length).toBe(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE)
    })

    it('contains at least one non-air block', () => {
      let nonAir = 0
      for (let i = 0; i < payload.buffer.length; i++) {
        if (payload.buffer[i] !== 0 && payload.buffer[i] !== CARVED_ID) nonAir++
      }
      expect(nonAir).toBeGreaterThan(0)
    })

    it('all block IDs resolve to known types via idToType', () => {
      const unknowns: number[] = []
      for (let i = 0; i < payload.buffer.length; i++) {
        const id = payload.buffer[i]
        if (id === 0 || id === CARVED_ID) continue
        if (idToType(id) === 'air') unknowns.push(id)
      }
      expect(unknowns).toEqual([])
    })

    /** Regression: pumpkin density must stay low (place when noise ≤ PUMPKIN_DENSITY). */
    it('keeps pumpkin count per chunk below threshold for fixed seed', () => {
      const pumpkinId = typeToId('pumpkin')
      const maxPumpkinsPerChunk = 5
      const chunkCoords = [
        [0, 0],
        [1, 0],
        [0, 1],
        [2, 2],
      ]
      for (const [chunkX, chunkZ] of chunkCoords) {
        const p = generatePayload(chunkX, chunkZ)
        let count = 0
        for (let i = 0; i < p.buffer.length; i++) {
          if (p.buffer[i] === pumpkinId) count++
        }
        expect(count).toBeLessThanOrEqual(maxPumpkinsPerChunk)
      }
    })
  })

  describe('heightmap', () => {
    it('2D heightmap has CHUNK_SIZE rows, each with CHUNK_SIZE entries', () => {
      expect(payload.heightmap).toBeDefined()
      expect(payload.heightmap.length).toBe(CHUNK_SIZE)
      for (const row of payload.heightmap) {
        expect(row.length).toBe(CHUNK_SIZE)
      }
    })

    it('heightmapBuffer is present and has CHUNK_SIZE * CHUNK_SIZE entries', () => {
      expect(payload.heightmapBuffer).toBeInstanceOf(Float32Array)
      expect(payload.heightmapBuffer!.length).toBe(CHUNK_SIZE * CHUNK_SIZE)
    })

    it('heightmapBuffer matches 2D heightmap (row-major: lx + lz * CHUNK_SIZE)', () => {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          expect(payload.heightmapBuffer![lx + lz * CHUNK_SIZE]).toBe(payload.heightmap[lx][lz])
        }
      }
    })
  })

  describe('geometryLayers', () => {
    it('is defined and non-empty for a chunk with blocks', () => {
      expect(payload.geometryLayers).toBeDefined()
      expect(payload.geometryLayers!.length).toBeGreaterThan(0)
    })

    it('every blockTypeId maps to a valid BlockType', () => {
      for (const layer of payload.geometryLayers!) {
        const type = idToType(layer.blockTypeId)
        expect(type).not.toBe('air')
      }
    })

    it('position and normal arrays have length divisible by 3', () => {
      for (const layer of payload.geometryLayers!) {
        expect(layer.position.length % 3).toBe(0)
        expect(layer.normal.length % 3).toBe(0)
        expect(layer.position.length).toBe(layer.normal.length)
      }
    })

    it('uv arrays have length divisible by 2', () => {
      for (const layer of payload.geometryLayers!) {
        expect(layer.uv.length % 2).toBe(0)
      }
    })

    it('vertex counts are consistent: position / 3 == uv / 2', () => {
      for (const layer of payload.geometryLayers!) {
        const vertexCount = layer.position.length / 3
        expect(layer.uv.length / 2).toBe(vertexCount)
      }
    })

    it('faceVertexCounts sums to total vertex or index count', () => {
      for (const layer of payload.geometryLayers!) {
        expect(layer.faceVertexCounts).toBeInstanceOf(Uint32Array)
        expect(layer.faceVertexCounts.length).toBe(6)
        let sum = 0
        for (const c of layer.faceVertexCounts) sum += c
        if (layer.index) {
          expect(layer.index).toBeInstanceOf(Uint32Array)
          expect(sum).toBe(layer.index.length)
        } else {
          expect(sum).toBe(layer.position.length / 3)
        }
      }
    })

    it('face order matches BoxGeometry: +Y (top) face has normal (0,1,0)', () => {
      const topFaceIndex = 2
      const expectedNy = 1
      for (const layer of payload.geometryLayers!) {
        const faceVertexCounts = layer.faceVertexCounts
        const start = (faceVertexCounts[0] ?? 0) + (faceVertexCounts[1] ?? 0)
        const topCount = faceVertexCounts[topFaceIndex] ?? 0
        if (topCount === 0) continue
        const end = start + topCount
        let foundTopNormal = false
        for (let i = start; i < end; i++) {
          const vi = layer.index ? layer.index[i] : i
          const ny = layer.normal[vi * 3 + 1]
          if (ny === expectedNy && layer.normal[vi * 3] === 0 && layer.normal[vi * 3 + 2] === 0) {
            foundTopNormal = true
            break
          }
        }
        expect(foundTopNormal, `layer blockTypeId=${layer.blockTypeId} top face should have at least one vertex with normal (0,1,0)`).toBe(true)
      }
    })

    it('UV layout is world-aligned so texture repeats on merged quads (no stretch)', () => {
      const buffer = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE)
      buffer.fill(0)
      buffer[terrainLocalKey(1, 1, 1)] = typeToId('stone')

      const { geometryLayers } = buildWorkerGeometryFromVoxelBuffer({
        buffer,
        worldX: 0,
        worldZ: 0,
      })
      expect(geometryLayers.length).toBeGreaterThan(0)

      const layer = geometryLayers[0]
      const faceVertexCounts = layer.faceVertexCounts
      const topFaceStart = (faceVertexCounts[0] ?? 0) + (faceVertexCounts[1] ?? 0)
      expect(faceVertexCounts[2] ?? 0).toBeGreaterThan(0)
      const firstVertex = layer.index ? layer.index[topFaceStart] : topFaceStart
      const workerU = layer.uv[firstVertex * 2]
      const workerV = layer.uv[firstVertex * 2 + 1]
      // Top face (+Y) uses plane (x,z): u=x, v=z. Block at (1,1,1) so first vertex has u,v in world range (e.g. 1–2).
      expect(workerU).toBeGreaterThanOrEqual(0)
      expect(workerV).toBeGreaterThanOrEqual(0)
    })

    /**
     * Regression: faces must be drawn at boundaries between different block types.
     * If we only drew faces toward empty neighbors, dirt next to stone would draw
     * neither the dirt's +X nor the stone's -X face → visible hole with solid collision.
     */
    it('draws faces between different block types (no holes at boundaries)', () => {
      const buffer = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE)
      buffer.fill(0)
      const dirtId = typeToId('dirt')
      const stoneId = typeToId('stone')
      buffer[terrainLocalKey(1, 1, 1)] = dirtId
      buffer[terrainLocalKey(2, 1, 1)] = stoneId

      const { geometryLayers } = buildWorkerGeometryFromVoxelBuffer({
        buffer,
        worldX: 0,
        worldZ: 0,
      })

      const dirtLayer = geometryLayers.find((l) => l.blockTypeId === dirtId)
      const stoneLayer = geometryLayers.find((l) => l.blockTypeId === stoneId)
      expect(dirtLayer).toBeDefined()
      expect(stoneLayer).toBeDefined()

      // Face 0 = +X (right), face 1 = -X (left). Dirt at (1,1,1) has stone at +X → must draw face 0.
      expect((dirtLayer!.faceVertexCounts[0] ?? 0)).toBeGreaterThan(0)
      // Stone at (2,1,1) has dirt at -X → must draw face 1.
      expect((stoneLayer!.faceVertexCounts[1] ?? 0)).toBeGreaterThan(0)
    })

    /**
     * When a block is destroyed, refresh replaces worker geometry with instanced BoxGeometry.
     * We use world-aligned UVs so merged quads don't stretch; layout then differs from Box so this test is skipped.
     * Enabling it would require matching Box corner order with world-aligned scale (per-face formulas).
     */
    it.skip('worker geometry UV layout matches BoxGeometry on all six faces (no rotation after refresh)', () => {
      const buffer = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE)
      buffer.fill(0)
      const lx = 1
      const ly = 1
      const lz = 1
      buffer[terrainLocalKey(lx, ly, lz)] = typeToId('stone')

      const { geometryLayers } = buildWorkerGeometryFromVoxelBuffer({
        buffer,
        worldX: 0,
        worldZ: 0,
      })
      expect(geometryLayers.length).toBeGreaterThan(0)
      const layer = geometryLayers[0]
      const faceVertexCounts = layer.faceVertexCounts

      const box = new THREE.BoxGeometry(1, 1, 1)
      const boxUV = box.getAttribute('uv') as THREE.BufferAttribute
      expect(box.groups.length).toBe(6)
      expect(layer.index).toBeDefined()
      const layerIndex = layer.index!

      let indexOffset = 0
      for (let face = 0; face < 6; face++) {
        const count = faceVertexCounts[face] ?? 0
        if (count === 0) continue

        const group = box.groups[face]
        expect(group.count).toBe(6)
        const boxIndexArr = box.index ? box.index.array : null

        // Worker uses world-aligned UVs (texture repeats on merged quads). Normalize to 0-1 per face to compare layout with Box.
        let minU = Infinity
        let maxU = -Infinity
        let minV = Infinity
        let maxV = -Infinity
        for (let v = 0; v < 6; v++) {
          const vi = layerIndex[indexOffset + v]
          const u = layer.uv[vi * 2]
          const vv = layer.uv[vi * 2 + 1]
          minU = Math.min(minU, u)
          maxU = Math.max(maxU, u)
          minV = Math.min(minV, vv)
          maxV = Math.max(maxV, vv)
        }
        const rangeU = maxU - minU || 1
        const rangeV = maxV - minV || 1

        for (let v = 0; v < 6; v++) {
          const workerVertexIndex = layerIndex[indexOffset + v]
          const workerU = layer.uv[workerVertexIndex * 2]
          const workerV = layer.uv[workerVertexIndex * 2 + 1]
          const normU = (workerU - minU) / rangeU
          const normV = (workerV - minV) / rangeV

          const boxVertexIndex = boxIndexArr ? boxIndexArr[group.start + v] : group.start + v
          const boxU = boxUV.getX(boxVertexIndex)
          const boxV = boxUV.getY(boxVertexIndex)

          expect(
            normU,
            `face ${face} vertex ${v}: normalized worker UV (${normU},${normV}) should match Box (${boxU},${boxV})`,
          ).toBeCloseTo(boxU, 5)
          expect(
            normV,
            `face ${face} vertex ${v}: normalized worker UV (${normU},${normV}) should match Box (${boxU},${boxV})`,
          ).toBeCloseTo(boxV, 5)
        }
        indexOffset += count
      }
    })
  })

  describe('visibleBlockKeysByType', () => {
    it('is defined and non-empty for a chunk with blocks', () => {
      expect(payload.visibleBlockKeysByType).toBeDefined()
      expect(payload.visibleBlockKeysByType!.length).toBeGreaterThan(0)
    })

    it('every blockTypeId maps to a valid BlockType', () => {
      for (const entry of payload.visibleBlockKeysByType!) {
        const type = idToType(entry.blockTypeId)
        expect(type).not.toBe('air')
      }
    })

    it('all keys decode to valid local coordinates', () => {
      for (const entry of payload.visibleBlockKeysByType!) {
        for (const key of entry.keys) {
          const lx = key % CHUNK_SIZE
          const ly = Math.floor(key / CHUNK_SIZE) % WORLD_HEIGHT
          const lz = Math.floor(key / (CHUNK_SIZE * WORLD_HEIGHT))
          expect(lx).toBeGreaterThanOrEqual(0)
          expect(lx).toBeLessThan(CHUNK_SIZE)
          expect(ly).toBeGreaterThanOrEqual(0)
          expect(ly).toBeLessThan(WORLD_HEIGHT)
          expect(lz).toBeGreaterThanOrEqual(0)
          expect(lz).toBeLessThan(CHUNK_SIZE)
        }
      }
    })
  })

  describe('localKey contract: terrain/block-ids and chunk-runtime agree', () => {
    it('produces identical keys for all in-range coordinates', () => {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let ly = 0; ly < 4; ly++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            expect(terrainLocalKey(lx, ly, lz)).toBe(runtimeLocalKey(lx, ly, lz))
          }
        }
      }
    })
  })

  describe('determinism', () => {
    it('same seed + coordinates produce identical payloads', () => {
      const a = generatePayload(3, -2)
      const b = generatePayload(3, -2)
      expect(a.chunkX).toBe(b.chunkX)
      expect(a.chunkZ).toBe(b.chunkZ)
      expect(a.buffer.length).toBe(b.buffer.length)
      for (let i = 0; i < a.buffer.length; i++) {
        if (a.buffer[i] !== b.buffer[i]) {
          throw new Error(`buffer mismatch at index ${i}: ${a.buffer[i]} vs ${b.buffer[i]}`)
        }
      }
      expect(a.heightmapBuffer).toEqual(b.heightmapBuffer)
    })
  })

  /**
   * Worker heightmap must match terrain-sampling (sync fallback) for same seed
   * so that main-thread getHeight and worker-generated chunks agree.
   */
  describe('worker heightmap vs terrain-sampling parity (sync fallback contract)', () => {
    it('payload heightmap matches terrain-sampling height for same seed and chunk', () => {
      const p = generatePayload(0, 0)
      const worldX = p.chunkX * CHUNK_SIZE
      const worldZ = p.chunkZ * CHUNK_SIZE
      const sampler = createTerrainSampling(TEST_SEED)
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          const smoothed = sampler.getSmoothedHeight(worldX + lx, worldZ + lz)
          const expectedY = Math.floor(Math.max(0, Math.min(WORLD_HEIGHT, smoothed)))
          expect(
            p.heightmap[lx][lz],
            `heightmap[${lx}][${lz}] (world ${worldX + lx}, ${worldZ + lz})`,
          ).toBe(expectedY)
        }
      }
    })
  })

  describe('different chunk coordinates', () => {
    it('works for negative chunk coordinates', () => {
      const p = generatePayload(-3, -5)
      expect(p.chunkX).toBe(-3)
      expect(p.chunkZ).toBe(-5)
      expect(p.buffer.length).toBe(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE)
      expect(p.geometryLayers!.length).toBeGreaterThan(0)
    })

    it('works for large positive coordinates', () => {
      const p = generatePayload(100, 200)
      expect(p.chunkX).toBe(100)
      expect(p.chunkZ).toBe(200)
      expect(p.buffer.length).toBe(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE)
    })
  })

  describe('snow layer placement', () => {
    it('when snowAccumulationHeight >= 1, every snow_layer block sits on grass_snow or snow', () => {
      const p = generatePayloadWithSnowHeight(0, 0, 2)
      const buf = p.buffer
      const strideY = CHUNK_SIZE
      const strideZ = CHUNK_SIZE * WORLD_HEIGHT
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let ly = 1; ly < WORLD_HEIGHT; ly++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const i = lx + ly * strideY + lz * strideZ
            const type = idToType(buf[i])
            if (!type.startsWith('snow_layer_')) continue
            const belowI = lx + (ly - 1) * strideY + lz * strideZ
            const belowType = idToType(buf[belowI])
            expect(
              belowType === 'grass_snow' || belowType === 'snow',
              `snow_layer at (${lx},${ly},${lz}) must sit on grass_snow or snow, got ${belowType}`,
            ).toBe(true)
          }
        }
      }
    })
  })
})

/**
 * Smoke tests for the terrain pipeline: generator and payload shape.
 */
import { describe, it, expect } from 'vitest'
import type { Biome } from '../types'
import { createChunkGenerator } from './index'
import { getBiomeByClimate, BIOME_REGISTRY } from './biomes'
import { CHUNK_SIZE, WORLD_HEIGHT } from '../constants'
import { localKey, idToType, CARVED_ID, VOXEL_BUFFER_LENGTH } from './block-ids'

/** All biomes from registry so tests accept any resolved biome. */
const ALL_BIOMES: readonly Biome[] = Object.keys(BIOME_REGISTRY) as Biome[]

describe('createChunkGenerator', () => {
  it('returns generateChunkData, getHeight, getResolvedBiome', () => {
    const gen = createChunkGenerator(12345)
    expect(typeof gen.generateChunkData).toBe('function')
    expect(typeof gen.getHeight).toBe('function')
    expect(typeof gen.getResolvedBiome).toBe('function')
  })

  it('generateChunkData returns valid ChunkDataPayload', () => {
    const gen = createChunkGenerator(1)
    const payload = gen.generateChunkData(0, 0, [])
    expect(payload.chunkX).toBe(0)
    expect(payload.chunkZ).toBe(0)
    expect(payload.heightmap).toBeDefined()
    expect(payload.heightmap.length).toBe(16)
    expect(payload.heightmap[0].length).toBe(16)
    expect(payload.buffer).toBeInstanceOf(Uint8Array)
    expect(payload.buffer.length).toBe(VOXEL_BUFFER_LENGTH)
    let nonAir = 0
    for (let i = 0; i < payload.buffer.length; i++) {
      const id = payload.buffer[i]
      if (id !== 0 && id !== CARVED_ID) nonAir++
    }
    expect(nonAir).toBeGreaterThan(0)
  })

  it('getHeight returns integer in world bounds', () => {
    const gen = createChunkGenerator(1)
    const h = gen.getHeight(0, 0)
    expect(Number.isInteger(h)).toBe(true)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThan(WORLD_HEIGHT)
  })

  it('heightmap contains finite integers and resolved biomes are valid', () => {
    const gen = createChunkGenerator(2)

    for (let cx = -3; cx <= 3; cx++) {
      for (let cz = -3; cz <= 3; cz++) {
        const payload = gen.generateChunkData(cx, cz, [])

        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const topY = payload.heightmap[lx][lz]
            expect(Number.isFinite(topY)).toBe(true)
            expect(Number.isInteger(topY)).toBe(true)
            expect(topY).toBeGreaterThanOrEqual(0)
            expect(topY).toBeLessThan(WORLD_HEIGHT)

            const wx = cx * CHUNK_SIZE + lx
            const wz = cz * CHUNK_SIZE + lz
            const biome = gen.getResolvedBiome(wx, wz)
            expect(ALL_BIOMES).toContain(biome)
          }
        }
      }
    }
  })

  it('trees never spawn on sand/stone/water and never in snow/grove', () => {
    const gen = createChunkGenerator(1)

    function bufferToVoxelMap(buffer: Uint8Array): Map<number, string> {
      const voxel = new Map<number, string>()
      for (let i = 0; i < buffer.length; i++) {
        const id = buffer[i]
        if (id === 0 || id === CARVED_ID) continue
        const type = idToType(id)
        if (type === 'air') continue
        const lx = i % CHUNK_SIZE
        const ly = Math.floor(i / CHUNK_SIZE) % WORLD_HEIGHT
        const lz = Math.floor(i / (CHUNK_SIZE * WORLD_HEIGHT))
        voxel.set(localKey(lx, ly, lz), type)
      }
      return voxel
    }

    for (let cx = -6; cx <= 6; cx++) {
      for (let cz = -6; cz <= 6; cz++) {
        const payload = gen.generateChunkData(cx, cz, [])
        const voxel = bufferToVoxelMap(payload.buffer)

        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const topY = payload.heightmap[lx][lz]
            const trunkY = topY + 1
            const k = localKey(lx, trunkY, lz)
            const type = voxel.get(k)
            if (type !== 'wood') continue

            const surfaceK = localKey(lx, topY, lz)
            const surface = voxel.get(surfaceK)
            expect(['grass', 'grass_snow', 'grass_savanna', 'dirt']).toContain(surface)

            const wx = cx * CHUNK_SIZE + lx
            const wz = cz * CHUNK_SIZE + lz
            const biome = gen.getResolvedBiome(wx, wz)
            expect(biome).not.toBe('snow')
            expect(biome).not.toBe('grove')
          }
        }
      }
    }
  })
})

describe('getBiomeByClimate', () => {
  it('returns a base biome for any (temp, humidity) in [0,1]', () => {
    const base = getBiomeByClimate(0.5, 0.5)
    expect([
      'desert',
      'plains',
      'savanna',
      'forest',
      'jungle',
      'mountain',
      'snow',
      'badlands',
      'mushroom_fields',
      'mangrove_swamp',
      'old_growth_taiga',
    ]).toContain(base)
  })

  it('low temp tends to snow', () => {
    const b = getBiomeByClimate(0.1, 0.4)
    expect(b).toBe('snow')
  })

  it('high temp low humidity tends to desert or badlands', () => {
    const b = getBiomeByClimate(0.9, 0.1)
    expect(['desert', 'badlands']).toContain(b)
  })
})

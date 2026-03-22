import { describe, expect, it } from 'vitest'
import { ALL_BIOMES, createChunkGenerator } from './index'
import { CHUNK_SIZE, WORLD_MIN_Y } from '../constants'
import { idToType, localKey } from './block-ids'

/** Baseline seeds for deterministic worldgen regression snapshots. */
const BASELINE_SEEDS = [12345, 424242] as const

/** Fixed world-space sample columns around spawn and nearby coast/inland transitions. */
const BASELINE_POINTS: ReadonlyArray<readonly [number, number]> = [
  [-96, -96],
  [-64, 0],
  [-32, 64],
  [0, -64],
  [0, 0],
  [0, 64],
  [32, -64],
  [64, 0],
  [96, 96],
] as const

interface BaselineColumnSample {
  x: number
  z: number
  biome: string
  topY: number
  topBlock: string
}

/**
 * Converts world coordinates to local chunk coordinates.
 */
function getChunkAndLocal(worldCoord: number): { chunk: number; local: number } {
  const chunk = Math.floor(worldCoord / CHUNK_SIZE)
  const local = ((worldCoord % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
  return { chunk, local }
}

/**
 * Samples biome, height, and top block for a fixed world column.
 */
function sampleColumn(seed: number, x: number, z: number): BaselineColumnSample {
  const generator = createChunkGenerator(seed)
  const { chunk: chunkX, local: lx } = getChunkAndLocal(x)
  const { chunk: chunkZ, local: lz } = getChunkAndLocal(z)
  const payload = generator.generateChunkData(chunkX, chunkZ, [])
  const topY = payload.heightmap[lx][lz]
  const ly = topY - WORLD_MIN_Y
  const topBlockId = payload.buffer[localKey(lx, ly, lz)]
  const biomeIndex = payload.biomeMapBuffer?.[lz * CHUNK_SIZE + lx] ?? 0
  const biome = ALL_BIOMES[biomeIndex] ?? `unknown_${biomeIndex}`
  return {
    x,
    z,
    biome,
    topY,
    topBlock: idToType(topBlockId),
  }
}

describe('worldgen baseline grid snapshots', () => {
  it('keeps biome/height/top-block stable on canonical seed grid', () => {
    const snapshots = BASELINE_SEEDS.map((seed) => ({
      seed,
      columns: BASELINE_POINTS.map(([x, z]) => sampleColumn(seed, x, z)),
    }))

    expect(snapshots).toMatchInlineSnapshot(`
      [
        {
          "columns": [
            {
              "biome": "plains",
              "topBlock": "grass",
              "topY": 71,
              "x": -96,
              "z": -96,
            },
            {
              "biome": "ocean",
              "topBlock": "sand",
              "topY": 36,
              "x": -64,
              "z": 0,
            },
            {
              "biome": "ocean",
              "topBlock": "sand",
              "topY": 34,
              "x": -32,
              "z": 64,
            },
            {
              "biome": "plains",
              "topBlock": "grass",
              "topY": 66,
              "x": 0,
              "z": -64,
            },
            {
              "biome": "plains",
              "topBlock": "grass",
              "topY": 64,
              "x": 0,
              "z": 0,
            },
            {
              "biome": "ocean",
              "topBlock": "sand",
              "topY": 35,
              "x": 0,
              "z": 64,
            },
            {
              "biome": "forest",
              "topBlock": "grass",
              "topY": 67,
              "x": 32,
              "z": -64,
            },
            {
              "biome": "windswept_gravelly_hills",
              "topBlock": "gravel",
              "topY": 63,
              "x": 64,
              "z": 0,
            },
            {
              "biome": "plains",
              "topBlock": "sand",
              "topY": 61,
              "x": 96,
              "z": 96,
            },
          ],
          "seed": 12345,
        },
        {
          "columns": [
            {
              "biome": "plains",
              "topBlock": "grass",
              "topY": 66,
              "x": -96,
              "z": -96,
            },
            {
              "biome": "plains",
              "topBlock": "grass",
              "topY": 66,
              "x": -64,
              "z": 0,
            },
            {
              "biome": "ocean",
              "topBlock": "sand",
              "topY": 35,
              "x": -32,
              "z": 64,
            },
            {
              "biome": "forest",
              "topBlock": "grass",
              "topY": 65,
              "x": 0,
              "z": -64,
            },
            {
              "biome": "forest",
              "topBlock": "grass",
              "topY": 65,
              "x": 0,
              "z": 0,
            },
            {
              "biome": "ocean",
              "topBlock": "sand",
              "topY": 35,
              "x": 0,
              "z": 64,
            },
            {
              "biome": "forest",
              "topBlock": "grass",
              "topY": 65,
              "x": 32,
              "z": -64,
            },
            {
              "biome": "forest",
              "topBlock": "grass",
              "topY": 68,
              "x": 64,
              "z": 0,
            },
            {
              "biome": "ocean",
              "topBlock": "sand",
              "topY": 34,
              "x": 96,
              "z": 96,
            },
          ],
          "seed": 424242,
        },
      ]
    `)
  })
})

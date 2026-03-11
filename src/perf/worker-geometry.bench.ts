import { bench, describe } from 'vitest'
import { CHUNK_SIZE, WORLD_HEIGHT, WATER_LEVEL } from '../constants'
import { typeToId } from '../terrain/block-ids'
import { buildWorkerGeometryFromVoxelBuffer } from '../terrain/worker-geometry'

function makeBufferGround(fillToY: number): Uint8Array {
  const size = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE
  const buf = new Uint8Array(size)
  const stone = typeToId('stone')
  const water = typeToId('water')

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
        const i = lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * WORLD_HEIGHT
        if (ly <= fillToY) buf[i] = stone
        else if (ly <= WATER_LEVEL) buf[i] = water
      }
    }
  }
  return buf
}

describe('perf: worker geometry', () => {
  const buffer = makeBufferGround(56)

  bench('buildWorkerGeometryFromVoxelBuffer (ground+water)', () => {
    buildWorkerGeometryFromVoxelBuffer({ buffer, worldX: 0, worldZ: 0 })
  })
})


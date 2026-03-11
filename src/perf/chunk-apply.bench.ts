import { bench, describe } from 'vitest'
import { CHUNK_SIZE, WORLD_HEIGHT } from '../constants'
import { typeToId } from '../terrain/block-ids'
import { buildVoxelMapFromBuffer } from '../game/chunks/chunk-apply'

function makeDenseStoneBuffer(): Uint8Array {
  const size = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE
  const buf = new Uint8Array(size)
  const stone = typeToId('stone')
  for (let i = 0; i < buf.length; i++) buf[i] = stone
  return buf
}

describe('perf: chunk apply helpers', () => {
  const buffer = makeDenseStoneBuffer()

  bench('buildVoxelMapFromBuffer (dense stone)', () => {
    buildVoxelMapFromBuffer(buffer)
  })
})


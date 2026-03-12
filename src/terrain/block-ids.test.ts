/**
 * Unit tests for terrain block-ids: typeToId, idToType, localKey, AIR_ID/CARVED_ID.
 */
import { describe, it, expect } from 'vitest'
import {
  typeToId,
  idToType,
  localKey,
  getBlockHeightById,
  isAirOrCarved,
  AIR_ID,
  CARVED_ID,
  ID_TO_TYPE,
  VOXEL_BUFFER_LENGTH,
} from './block-ids'
import { CHUNK_SIZE, WORLD_HEIGHT } from '../constants'

describe('typeToId and idToType', () => {
  it('roundtrip for every entry in ID_TO_TYPE', () => {
    for (let id = 0; id < ID_TO_TYPE.length; id++) {
      const type = ID_TO_TYPE[id]
      expect(typeToId(type)).toBe(id)
      expect(idToType(id)).toBe(type)
    }
  })

  it('AIR_ID and CARVED_ID map to air', () => {
    expect(idToType(AIR_ID)).toBe('air')
    expect(idToType(CARVED_ID)).toBe('air')
  })

  it('isAirOrCarved returns true only for AIR_ID and CARVED_ID', () => {
    expect(isAirOrCarved(AIR_ID)).toBe(true)
    expect(isAirOrCarved(CARVED_ID)).toBe(true)
    expect(isAirOrCarved(typeToId('stone'))).toBe(false)
    expect(isAirOrCarved(1)).toBe(false)
  })

  it('idToType returns air for out-of-range id', () => {
    expect(idToType(999)).toBe('air')
    expect(idToType(-1)).toBe('air')
  })

  it('typeToId returns AIR_ID for unknown type', () => {
    expect(typeToId('unknown_block' as 'stone')).toBe(AIR_ID)
  })
})

describe('getBlockHeightById', () => {
  it('returns 1 for full blocks', () => {
    expect(getBlockHeightById(typeToId('stone'))).toBe(1)
    expect(getBlockHeightById(typeToId('snow'))).toBe(1)
  })

  it('returns layer/8 for snow_layer_1..8', () => {
    for (let k = 1; k <= 8; k++) {
      const id = typeToId(`snow_layer_${k}` as 'snow_layer_1')
      expect(getBlockHeightById(id)).toBe(k / 8)
    }
  })
})

describe('localKey', () => {
  it('matches formula lx + ly*CHUNK_SIZE + lz*CHUNK_SIZE*WORLD_HEIGHT', () => {
    expect(localKey(0, 0, 0)).toBe(0)
    expect(localKey(1, 0, 0)).toBe(1)
    expect(localKey(0, 1, 0)).toBe(CHUNK_SIZE)
    expect(localKey(0, 0, 1)).toBe(CHUNK_SIZE * WORLD_HEIGHT)
    const lx = 5
    const ly = 10
    const lz = 7
    expect(localKey(lx, ly, lz)).toBe(lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * WORLD_HEIGHT)
  })

  it('max key is below VOXEL_BUFFER_LENGTH', () => {
    const k = localKey(CHUNK_SIZE - 1, WORLD_HEIGHT - 1, CHUNK_SIZE - 1)
    expect(k).toBeLessThan(VOXEL_BUFFER_LENGTH)
    expect(k).toBeGreaterThanOrEqual(0)
  })
})

describe('VOXEL_BUFFER_LENGTH', () => {
  it('equals CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE', () => {
    expect(VOXEL_BUFFER_LENGTH).toBe(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE)
  })
})

/**
 * Tests for voxel AABB collision: resolveVoxelCollisions with minimal world state.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { resolveVoxelCollisions, PLAYER_HALF, PLAYER_HEIGHT } from './game-collision'
import { WORLD_MIN_Y } from './constants'
import {
  chunks,
  chunkKeyNumeric,
  localKey,
  blockModifications,
  columnHeightCache,
  getBlockAt,
} from './chunk-runtime'
import type { ChunkData } from './types'

function makeChunkData(cx: number, cz: number, voxelMap: Map<number, string>): ChunkData {
  return {
    group: null as unknown as ChunkData['group'],
    cx,
    cz,
    voxelMap,
    blockPositionsByType: new Map(),
  }
}

describe('resolveVoxelCollisions', () => {
  beforeEach(() => {
    chunks.clear()
    blockModifications.clear()
    columnHeightCache.clear()
  })

  it('pushes player up onto floor and sets grounded when landing on solid block', () => {
    const worldY = 4
    const voxel = new Map<number, string>()
    voxel.set(localKey(0, worldY - WORLD_MIN_Y, 0), 'stone')
    chunks.set(chunkKeyNumeric(0, 0), makeChunkData(0, 0, voxel))
    expect(getBlockAt(0, worldY, 0)).toBe('stone')

    const position = { x: 0.5, y: 5.5, z: 0.5 }
    const velocity = { x: 0, y: -1, z: 0 }
    const result = resolveVoxelCollisions(
      position,
      velocity,
      1,
      PLAYER_HALF,
      PLAYER_HALF,
      PLAYER_HEIGHT,
    )

    expect(position.y).toBe(5)
    expect(velocity.y).toBe(0)
    expect(result.hitYDown).toBe(true)
  })

  it('sets grounded when landing with feet near block top', () => {
    const worldY = 4
    const voxel = new Map<number, string>()
    voxel.set(localKey(0, worldY - WORLD_MIN_Y, 0), 'stone')
    chunks.set(chunkKeyNumeric(0, 0), makeChunkData(0, 0, voxel))

    const position = { x: 0.5, y: 5.95, z: 0.5 }
    const velocity = { x: 0, y: -1, z: 0 }
    const result = resolveVoxelCollisions(
      position,
      velocity,
      1,
      PLAYER_HALF,
      PLAYER_HALF,
      PLAYER_HEIGHT,
    )

    expect(position.y).toBe(5)
    expect(result.grounded).toBe(true)
  })

  it('does not snap up when standing on snow layer with adjacent full block', () => {
    const worldY = 4
    const ly = worldY - WORLD_MIN_Y
    const voxel = new Map<number, string>()
    voxel.set(localKey(0, ly, 0), 'snow_layer_1')
    voxel.set(localKey(1, ly, 0), 'stone')
    chunks.set(chunkKeyNumeric(0, 0), makeChunkData(0, 0, voxel))

    const position = { x: 0.5, y: 4.12, z: 0.5 }
    const velocity = { x: 0, y: 0, z: 0 }
    const result = resolveVoxelCollisions(
      position,
      velocity,
      1,
      PLAYER_HALF,
      PLAYER_HALF,
      PLAYER_HEIGHT,
    )

    expect(position.y).toBe(4.125)
    expect(result.grounded).toBe(true)
  })

  it('does not push when no blocks under player (empty world)', () => {
    const position = { x: 0.5, y: 64, z: 0.5 }
    const velocity = { x: 0, y: -1, z: 0 }
    const result = resolveVoxelCollisions(
      position,
      velocity,
      1,
      PLAYER_HALF,
      PLAYER_HALF,
      PLAYER_HEIGHT,
    )

    expect(result.grounded).toBe(false)
    expect(result.hitYDown).toBe(false)
    expect(position.y).toBe(63)
    expect(velocity.y).toBe(-1)
  })

  it('pushes player down from ceiling (hitYUp)', () => {
    const worldY = 8
    const voxel = new Map<number, string>()
    voxel.set(localKey(5, worldY - WORLD_MIN_Y, 5), 'stone')
    chunks.set(chunkKeyNumeric(0, 0), makeChunkData(0, 0, voxel))

    const position = { x: 5.5, y: 6.0, z: 5.5 }
    const velocity = { x: 0, y: 1, z: 0 }
    const result = resolveVoxelCollisions(
      position,
      velocity,
      1,
      PLAYER_HALF,
      PLAYER_HALF,
      PLAYER_HEIGHT,
    )

    expect(result.hitYUp).toBe(true)
    expect(velocity.y).toBe(0)
    expect(position.y).toBeLessThanOrEqual(8 - PLAYER_HEIGHT + 0.001)
  })

  it('resolves X-axis wall collision', () => {
    const ly5 = 5 - WORLD_MIN_Y
    const ly6 = 6 - WORLD_MIN_Y
    const voxel = new Map<number, string>()
    voxel.set(localKey(5, ly5, 5), 'stone')
    voxel.set(localKey(5, ly6, 5), 'stone')
    chunks.set(chunkKeyNumeric(0, 0), makeChunkData(0, 0, voxel))

    const position = { x: 4.0, y: 5.0, z: 5.5 }
    const velocity = { x: 1, y: 0, z: 0 }
    const result = resolveVoxelCollisions(
      position,
      velocity,
      1,
      PLAYER_HALF,
      PLAYER_HALF,
      PLAYER_HEIGHT,
    )

    expect(result.hitX).toBe(true)
    expect(velocity.x).toBe(0)
    expect(position.x).toBeLessThanOrEqual(5 - PLAYER_HALF + 0.001)
  })

  it('resolves Z-axis wall collision', () => {
    const ly5 = 5 - WORLD_MIN_Y
    const ly6 = 6 - WORLD_MIN_Y
    const voxel = new Map<number, string>()
    voxel.set(localKey(5, ly5, 5), 'stone')
    voxel.set(localKey(5, ly6, 5), 'stone')
    chunks.set(chunkKeyNumeric(0, 0), makeChunkData(0, 0, voxel))

    const position = { x: 5.5, y: 5.0, z: 4.0 }
    const velocity = { x: 0, y: 0, z: 1 }
    const result = resolveVoxelCollisions(
      position,
      velocity,
      1,
      PLAYER_HALF,
      PLAYER_HALF,
      PLAYER_HEIGHT,
    )

    expect(result.hitZ).toBe(true)
    expect(velocity.z).toBe(0)
    expect(position.z).toBeLessThanOrEqual(5 - PLAYER_HALF + 0.001)
  })

  it('resolves simultaneous X and Z wall collision (L-shaped corner)', () => {
    const voxel = new Map<number, string>()
    for (let worldY = 5; worldY <= 7; worldY++) {
      const ly = worldY - WORLD_MIN_Y
      voxel.set(localKey(7, ly, 5), 'stone')
      voxel.set(localKey(7, ly, 6), 'stone')
      voxel.set(localKey(5, ly, 7), 'stone')
      voxel.set(localKey(6, ly, 7), 'stone')
    }
    chunks.set(chunkKeyNumeric(0, 0), makeChunkData(0, 0, voxel))

    const position = { x: 6.0, y: 5.0, z: 6.0 }
    const velocity = { x: 1, y: 0, z: 1 }
    const result = resolveVoxelCollisions(
      position,
      velocity,
      1,
      PLAYER_HALF,
      PLAYER_HALF,
      PLAYER_HEIGHT,
    )

    const hitWall = result.hitX || result.hitZ
    expect(hitWall).toBe(true)
  })

  it('handles floor block at chunk boundary (chunk 0 next to chunk 1)', () => {
    const worldY = 4
    const ly = worldY - WORLD_MIN_Y
    const voxel0 = new Map<number, string>()
    voxel0.set(localKey(15, ly, 5), 'stone')
    chunks.set(chunkKeyNumeric(0, 0), makeChunkData(0, 0, voxel0))

    const voxel1 = new Map<number, string>()
    voxel1.set(localKey(0, ly, 5), 'stone')
    chunks.set(chunkKeyNumeric(1, 0), makeChunkData(1, 0, voxel1))

    const position = { x: 15.8, y: 5.5, z: 5.5 }
    const velocity = { x: 0, y: -1, z: 0 }
    const result = resolveVoxelCollisions(
      position,
      velocity,
      1,
      PLAYER_HALF,
      PLAYER_HALF,
      PLAYER_HEIGHT,
    )

    expect(result.hitYDown).toBe(true)
    expect(position.y).toBe(5)
  })

  it('player stands on ground without falling through (grounded stability)', () => {
    const worldY = 4
    const voxel = new Map<number, string>()
    voxel.set(localKey(5, worldY - WORLD_MIN_Y, 5), 'stone')
    chunks.set(chunkKeyNumeric(0, 0), makeChunkData(0, 0, voxel))

    const position = { x: 5.5, y: 5.0, z: 5.5 }
    const velocity = { x: 0, y: -0.01, z: 0 }
    const result = resolveVoxelCollisions(
      position,
      velocity,
      0.016,
      PLAYER_HALF,
      PLAYER_HALF,
      PLAYER_HEIGHT,
    )

    expect(result.grounded).toBe(true)
    expect(position.y).toBe(5)
  })

  it('does not block X movement toward low block (snow_layer_1, height <= 0.5)', () => {
    const worldY = 5
    const voxel = new Map<number, string>()
    voxel.set(localKey(5, worldY - WORLD_MIN_Y, 5), 'snow_layer_1')
    chunks.set(chunkKeyNumeric(0, 0), makeChunkData(0, 0, voxel))

    const position = { x: 4.0, y: 5.0, z: 5.5 }
    const velocity = { x: 1, y: 0, z: 0 }
    const result = resolveVoxelCollisions(
      position,
      velocity,
      1,
      PLAYER_HALF,
      PLAYER_HALF,
      PLAYER_HEIGHT,
    )

    expect(result.hitX).toBe(false)
    expect(position.x).toBe(5.0)
  })

  it('does not block Z movement toward low block (snow_layer_1, height <= 0.5)', () => {
    const worldY = 5
    const voxel = new Map<number, string>()
    voxel.set(localKey(5, worldY - WORLD_MIN_Y, 5), 'snow_layer_1')
    chunks.set(chunkKeyNumeric(0, 0), makeChunkData(0, 0, voxel))

    const position = { x: 5.5, y: 5.0, z: 4.0 }
    const velocity = { x: 0, y: 0, z: 1 }
    const result = resolveVoxelCollisions(
      position,
      velocity,
      1,
      PLAYER_HALF,
      PLAYER_HALF,
      PLAYER_HEIGHT,
    )

    expect(result.hitZ).toBe(false)
    expect(position.z).toBe(5.0)
  })
})

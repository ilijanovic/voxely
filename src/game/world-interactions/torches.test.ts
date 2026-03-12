/**
 * Unit tests for torch helpers: attachment normals, support checks, and placement selection.
 */
import { describe, expect, it } from 'vitest'
import {
  TORCH_FLOOR_NORMAL,
  canSupportTorch,
  getTorchAttachmentNormalFromBlockType,
  isWallTorchBlockType,
  resolveTorchAttachmentNormal,
} from './torches'

describe('torches helpers', () => {
  it('isWallTorchBlockType matches only wall torch variants', () => {
    expect(isWallTorchBlockType('wall_torch_north')).toBe(true)
    expect(isWallTorchBlockType('wall_torch_east')).toBe(true)
    expect(isWallTorchBlockType('wall_torch_south')).toBe(true)
    expect(isWallTorchBlockType('wall_torch_west')).toBe(true)
    expect(isWallTorchBlockType('torch')).toBe(false)
    expect(isWallTorchBlockType('wall_torch')).toBe(false)
  })

  it('getTorchAttachmentNormalFromBlockType returns correct normals', () => {
    expect(getTorchAttachmentNormalFromBlockType('torch')).toEqual(TORCH_FLOOR_NORMAL)
    expect(getTorchAttachmentNormalFromBlockType('wall_torch_east')).toEqual({ x: 1, y: 0, z: 0 })
    expect(getTorchAttachmentNormalFromBlockType('wall_torch_west')).toEqual({ x: -1, y: 0, z: 0 })
    expect(getTorchAttachmentNormalFromBlockType('wall_torch_south')).toEqual({ x: 0, y: 0, z: 1 })
    expect(getTorchAttachmentNormalFromBlockType('wall_torch_north')).toEqual({ x: 0, y: 0, z: -1 })
  })

  it('canSupportTorch rejects air and ceilings, accepts solid tops and non-transparent sides', () => {
    expect(canSupportTorch('air', { x: 0, y: 1, z: 0 })).toBe(false)
    expect(canSupportTorch(null, { x: 0, y: 1, z: 0 })).toBe(false)
    expect(canSupportTorch('stone', { x: 0, y: -1, z: 0 })).toBe(false)
    expect(canSupportTorch('stone', { x: 0, y: 1, z: 0 })).toBe(true)
    expect(canSupportTorch('stone', { x: 1, y: 0, z: 0 })).toBe(true)
    // Ice is a transparent solid in this project; should not support wall torches on the side.
    expect(canSupportTorch('ice', { x: 1, y: 0, z: 0 })).toBe(false)
    // But ice can still support a floor torch on top.
    expect(canSupportTorch('ice', { x: 0, y: 1, z: 0 })).toBe(true)
  })

  it('resolveTorchAttachmentNormal prefers floor when supported', () => {
    const getBlockAt = (x: number, y: number, z: number) => {
      // Support directly below torch cell (0,-1,0) for torch at (0,0,0)
      if (x === 0 && y === -1 && z === 0) return 'stone'
      return 'air'
    }
    expect(resolveTorchAttachmentNormal(0, 0, 0, getBlockAt)).toEqual(TORCH_FLOOR_NORMAL)
  })

  it('resolveTorchAttachmentNormal falls back to wall support when floor is not supported', () => {
    const getBlockAt = (x: number, y: number, z: number) => {
      // Support on west side (normal +X => support at x-1)
      if (x === -1 && y === 0 && z === 0) return 'stone'
      return 'air'
    }
    expect(resolveTorchAttachmentNormal(0, 0, 0, getBlockAt)).toEqual({ x: 1, y: 0, z: 0 })
  })
})


import { describe, expect, it } from 'vitest'
import { WORLD_MIN_Y } from '../../constants'
import {
  isFallingBlockType,
  computeFallingBlockMoves,
  type FallingBlockCandidate,
} from './falling-blocks'

/**
 * Builds a getBlockAt function from a simple string-keyed map.
 */
function makeGetBlockAt(entries: Array<[string, import('../../types').BlockType | 'air' | null]>) {
  const map = new Map(entries)
  return (bx: number, by: number, bz: number) => map.get(`${bx},${by},${bz}`) ?? 'air'
}

describe('isFallingBlockType', () => {
  it('returns true for gravity blocks', () => {
    expect(isFallingBlockType('sand')).toBe(true)
    expect(isFallingBlockType('red_sand')).toBe(true)
    expect(isFallingBlockType('gravel')).toBe(true)
  })

  it('returns false for non-gravity blocks', () => {
    expect(isFallingBlockType('stone')).toBe(false)
    expect(isFallingBlockType('air')).toBe(false)
  })
})

describe('computeFallingBlockMoves', () => {
  it('moves sand down by one when below is air', () => {
    const candidates: FallingBlockCandidate[] = [{ bx: 0, by: 10, bz: 0 }]
    const getBlockAt = makeGetBlockAt([
      ['0,10,0', 'sand'],
      ['0,9,0', 'air'],
    ])
    const out = computeFallingBlockMoves({ getBlockAt, candidates })
    expect(out).toEqual([
      {
        fromX: 0,
        fromY: 10,
        fromZ: 0,
        toX: 0,
        toY: 9,
        toZ: 0,
        blockType: 'sand',
      },
    ])
  })

  it('does not move when below is not air', () => {
    const candidates: FallingBlockCandidate[] = [{ bx: 0, by: 10, bz: 0 }]
    const getBlockAt = makeGetBlockAt([
      ['0,10,0', 'gravel'],
      ['0,9,0', 'stone'],
    ])
    const out = computeFallingBlockMoves({ getBlockAt, candidates })
    expect(out).toEqual([])
  })

  it('does not move at world floor', () => {
    const candidates: FallingBlockCandidate[] = [{ bx: 0, by: WORLD_MIN_Y, bz: 0 }]
    const getBlockAt = makeGetBlockAt([[`0,${WORLD_MIN_Y},0`, 'sand']])
    const out = computeFallingBlockMoves({ getBlockAt, candidates })
    expect(out).toEqual([])
  })

  it('respects maxMovesPerTick', () => {
    const candidates: FallingBlockCandidate[] = [
      { bx: 0, by: 10, bz: 0 },
      { bx: 1, by: 10, bz: 0 },
    ]
    const getBlockAt = makeGetBlockAt([
      ['0,10,0', 'sand'],
      ['0,9,0', 'air'],
      ['1,10,0', 'gravel'],
      ['1,9,0', 'air'],
    ])
    const out = computeFallingBlockMoves({ getBlockAt, candidates, maxMovesPerTick: 1 })
    expect(out).toHaveLength(1)
  })
})

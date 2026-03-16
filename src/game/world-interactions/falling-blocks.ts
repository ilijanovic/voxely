import { WORLD_MIN_Y } from '../../constants'
import type { BlockType } from '../../types'

const FALLING_BLOCK_TYPES = new Set<BlockType>(['sand', 'red_sand', 'gravel'])

export type FallingBlockCandidate = {
  bx: number
  by: number
  bz: number
}

export type FallingBlockMove = {
  fromX: number
  fromY: number
  fromZ: number
  toX: number
  toY: number
  toZ: number
  blockType: BlockType
}

/**
 * Returns true when the block type should fall under gravity when unsupported.
 */
export function isFallingBlockType(type: BlockType | 'air'): boolean {
  if (type === 'air') return false
  return FALLING_BLOCK_TYPES.has(type)
}

/**
 * Computes one-step falling moves for supported falling blocks.
 * A move is produced only when the source is a falling block and the cell below is air.
 */
export function computeFallingBlockMoves(params: {
  getBlockAt: (bx: number, by: number, bz: number) => BlockType | 'air' | null
  candidates: FallingBlockCandidate[]
  maxMovesPerTick?: number
}): FallingBlockMove[] {
  const out: FallingBlockMove[] = []
  const usedTargets = new Set<string>()
  const limit = params.maxMovesPerTick ?? params.candidates.length

  for (const { bx, by, bz } of params.candidates) {
    if (out.length >= limit) break
    if (by <= WORLD_MIN_Y) continue
    const at = params.getBlockAt(bx, by, bz)
    if (at === null || at === 'air' || !isFallingBlockType(at)) continue
    const below = params.getBlockAt(bx, by - 1, bz)
    if (below !== 'air') continue
    const targetKey = `${bx},${by - 1},${bz}`
    if (usedTargets.has(targetKey)) continue
    usedTargets.add(targetKey)
    out.push({
      fromX: bx,
      fromY: by,
      fromZ: bz,
      toX: bx,
      toY: by - 1,
      toZ: bz,
      blockType: at,
    })
  }

  return out
}

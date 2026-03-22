import type { BlockType } from '../../types'

export interface FallingMove {
  fromX: number
  fromY: number
  fromZ: number
  toX: number
  toY: number
  toZ: number
  blockType: BlockType
}

export interface FallingCandidate {
  bx: number
  by: number
  bz: number
}

export interface ComputeFallingBlockMovesArgs {
  getBlockAt: (bx: number, by: number, bz: number) => BlockType | null
  candidates: FallingCandidate[]
  maxMovesPerTick: number
}

/**
 * Returns true when a block type should be simulated as a falling block (gravity).
 *
 * @param t - Block type
 * @returns Whether this type falls when unsupported
 */
export function isFallingBlockType(t: BlockType): boolean {
  return t === 'sand' || t === 'red_sand' || t === 'gravel'
}

/**
 * Returns true when the block at (bx,by,bz) is considered "empty" for falling blocks.
 * We treat null (out of world / not loaded), air, and carved as empty.
 *
 * @param getBlockAt - Block getter
 * @param bx - World X
 * @param by - World Y
 * @param bz - World Z
 * @returns Whether the cell is empty
 */
function isEmptyCell(
  getBlockAt: ComputeFallingBlockMovesArgs['getBlockAt'],
  bx: number,
  by: number,
  bz: number,
): boolean {
  const below = getBlockAt(bx, by, bz)
  return below == null || below === 'air' || below === 'carved'
}

/**
 * Computes falling block moves for this tick.
 * Each move drops a falling block down by exactly one cell if the cell below is empty.
 *
 * @param args - Input context
 * @returns Moves to apply (limited by maxMovesPerTick)
 */
export function computeFallingBlockMoves(args: ComputeFallingBlockMovesArgs): FallingMove[] {
  const { getBlockAt, candidates, maxMovesPerTick } = args
  const moves: FallingMove[] = []

  for (let i = 0; i < candidates.length && moves.length < maxMovesPerTick; i++) {
    const c = candidates[i]
    const t = getBlockAt(c.bx, c.by, c.bz)
    if (t == null || t === 'air') continue
    if (!isFallingBlockType(t)) continue
    if (c.by <= -1024) continue
    if (!isEmptyCell(getBlockAt, c.bx, c.by - 1, c.bz)) continue

    moves.push({
      fromX: c.bx,
      fromY: c.by,
      fromZ: c.bz,
      toX: c.bx,
      toY: c.by - 1,
      toZ: c.bz,
      blockType: t,
    })
  }

  return moves
}


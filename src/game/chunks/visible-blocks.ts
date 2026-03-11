import type { BlockPos, BlockType } from '../../types'

export type VisibleBlockFilterInput = {
  worldX: number
  worldZ: number
  chunkSize: number
  worldHeight: number
  voxelMap: Map<number, BlockType>
  positions: BlockPos[]
  localKey: (lx: number, ly: number, lz: number) => number
  isSolidBlock: (blockType: BlockType) => boolean
}

/**
 * Face-culling: keep only blocks that have at least one visible face (non-solid neighbor).
 * Reduces overdraw by not rendering blocks fully surrounded by solid blocks.
 */
export function filterVisibleBlocks(input: VisibleBlockFilterInput): BlockPos[] {
  const out: BlockPos[] = []
  const dirs: [number, number, number][] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ]
  for (const pos of input.positions) {
    const lx = pos.x - input.worldX
    const ly = pos.y
    const lz = pos.z - input.worldZ
    let visible = false
    for (const [dx, dy, dz] of dirs) {
      const nx = lx + dx
      const ny = ly + dy
      const nz = lz + dz
      if (
        nx < 0 ||
        nx >= input.chunkSize ||
        ny < 0 ||
        ny >= input.worldHeight ||
        nz < 0 ||
        nz >= input.chunkSize
      ) {
        visible = true
        break
      }
      const neighborType = input.voxelMap.get(input.localKey(nx, ny, nz))
      if (!neighborType || !input.isSolidBlock(neighborType)) {
        visible = true
        break
      }
    }
    if (visible) out.push(pos)
  }
  return out
}

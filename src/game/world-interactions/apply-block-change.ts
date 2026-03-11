import type { BlockType, ChunkData } from '../../types'
import { CHUNK_SIZE } from '../../constants'
import { chunkKeyNumeric, localKey } from '../../chunk-runtime'

export function applyBlockChangeToLoadedChunk(params: {
  chunks: Map<number, ChunkData>
  bx: number
  by: number
  bz: number
  next: BlockType | 'air'
  getBlockAt: (bx: number, by: number, bz: number) => BlockType | 'air' | null
}): { data: ChunkData | null; keyNum: number; affectedBlockTypes: Set<BlockType> } {
  const { bx, by, bz, next } = params
  const cx = Math.floor(bx / CHUNK_SIZE)
  const cz = Math.floor(bz / CHUNK_SIZE)
  const keyNum = chunkKeyNumeric(cx, cz)
  const data = params.chunks.get(keyNum) ?? null

  const affectedBlockTypes = new Set<BlockType>()
  if (next !== 'air') affectedBlockTypes.add(next)

  if (data) {
    const lx = bx - data.cx * CHUNK_SIZE
    const lz = bz - data.cz * CHUNK_SIZE
    const k = localKey(lx, by, lz)
    if (next === 'air') data.voxelMap.delete(k)
    else data.voxelMap.set(k, next)
  }

  const neighbors: Array<[number, number, number]> = [
    [bx + 1, by, bz],
    [bx - 1, by, bz],
    [bx, by + 1, bz],
    [bx, by - 1, bz],
    [bx, by, bz + 1],
    [bx, by, bz - 1],
  ]
  for (const [nx, ny, nz] of neighbors) {
    const t = params.getBlockAt(nx, ny, nz)
    if (t !== null && t !== 'air') affectedBlockTypes.add(t as BlockType)
  }

  return { data, keyNum, affectedBlockTypes }
}

import type { BlockPos, BlockType, ChunkData } from '../../types'
import { WORLD_MIN_Y } from '../../constants'

/**
 * Breaks one block at the given world position: updates block mods, chunk voxel map, height cache; optionally refreshes meshes and spawns drop.
 * When skipRefresh is true, caller is responsible for re-requesting the chunk from the worker.
 */
export function breakBlock(params: {
  chunkKeyNum: number
  blockType: BlockType
  worldX: number
  worldY: number
  worldZ: number
  chunks: Map<number, ChunkData>
  getLayerPositions: (data: ChunkData, blockType: BlockType) => BlockPos[] | null
  isUnbreakableBlock: (blockType: BlockType) => boolean
  setBlockModification: (x: number, y: number, z: number, value: BlockType | 'air') => void
  invalidateColumnHeight: (x: number, z: number) => void
  localKey: (lx: number, ly: number, lz: number) => number
  chunkSize: number
  isSolidBlock: (blockType: BlockType) => boolean
  getBlockHeight: (blockType: BlockType) => number
  getBlockAt: (x: number, y: number, z: number) => BlockType | 'air' | null
  refreshChunkVisibleMeshes: (data: ChunkData, affectedBlockTypes?: Set<BlockType>) => void
  /** Current game time in seconds (for drop landing animation). */
  time: number
  spawnDrop: (
    worldX: number,
    worldZ: number,
    startY: number,
    restY: number,
    blockType: BlockType,
    time: number,
  ) => void
  /** When true, do not refresh meshes (caller will re-request chunk from worker and replace). */
  skipRefresh?: boolean
  /** Override drop item type (e.g. door_open and door_closed both drop door_closed). */
  dropType?: BlockType
}): void {
  if (params.isUnbreakableBlock(params.blockType)) return
  const data = params.chunks.get(params.chunkKeyNum)
  if (!data) return
  const positions = params.getLayerPositions(data, params.blockType)
  if (!positions) return
  const instanceIndex = positions.findIndex(
    (p) => p.x === params.worldX && p.y === params.worldY && p.z === params.worldZ,
  )
  const pos =
    instanceIndex >= 0
      ? positions[instanceIndex]
      : { x: params.worldX, y: params.worldY, z: params.worldZ }

  const affectedBlockTypes = new Set<BlockType>([params.blockType])

  /** When breaking a door, clear the other half (same column) and drop a single door_closed. */
  const isDoorBlock = (t: string | null): t is BlockType =>
    t === 'door_closed' || t === 'door_open'
  if (isDoorBlock(params.blockType)) {
    const above = params.getBlockAt(pos.x, pos.y + 1, pos.z)
    const below = params.getBlockAt(pos.x, pos.y - 1, pos.z)
    const otherBy = isDoorBlock(above) ? pos.y + 1 : isDoorBlock(below) ? pos.y - 1 : null
    if (otherBy !== null) {
      const otherType = params.getBlockAt(pos.x, otherBy, pos.z)
      if (otherType !== null && otherType !== 'air') affectedBlockTypes.add(otherType as BlockType)
      params.setBlockModification(pos.x, otherBy, pos.z, 'air')
      const lxOther = pos.x - data.cx * params.chunkSize
      const lzOther = pos.z - data.cz * params.chunkSize
      data.voxelMap.delete(params.localKey(lxOther, otherBy - WORLD_MIN_Y, lzOther))
    }
  }

  params.setBlockModification(pos.x, pos.y, pos.z, 'air')
  params.invalidateColumnHeight(pos.x, pos.z)
  const lx = pos.x - data.cx * params.chunkSize
  const lz = pos.z - data.cz * params.chunkSize
  data.voxelMap.delete(params.localKey(lx, pos.y - WORLD_MIN_Y, lz))
  const neighbors: [number, number, number][] = [
    [pos.x + 1, pos.y, pos.z],
    [pos.x - 1, pos.y, pos.z],
    [pos.x, pos.y + 1, pos.z],
    [pos.x, pos.y - 1, pos.z],
    [pos.x, pos.y, pos.z + 1],
    [pos.x, pos.y, pos.z - 1],
  ]
  for (const [nx, ny, nz] of neighbors) {
    const t = params.getBlockAt(nx, ny, nz)
    if (t !== null && t !== 'air') affectedBlockTypes.add(t as BlockType)
  }

  if (instanceIndex === -1) {
    if (!params.skipRefresh) params.refreshChunkVisibleMeshes(data, affectedBlockTypes)
    return
  }

  const cx = pos.x + 0.5
  const cz = pos.z + 0.5
  const dropSize = 0.35
  const startY = pos.y + 0.5
  let groundY = pos.y - 1 + 0.5
  for (let by = pos.y - 1; by >= WORLD_MIN_Y; by--) {
    const t = params.getBlockAt(pos.x, by, pos.z)
    if (t !== null && t !== 'air' && params.isSolidBlock(t as BlockType)) {
      groundY = by + params.getBlockHeight(t as BlockType)
      break
    }
  }
  const restY = groundY + dropSize * 0.5
  const dropItemType = params.dropType ?? params.blockType
  params.spawnDrop(cx, cz, startY, restY, dropItemType, params.time)
  if (!params.skipRefresh) params.refreshChunkVisibleMeshes(data, affectedBlockTypes)
}

/**
 * Desert temple template: small sandstone building (rectangular base + walls).
 */
import type { BlockType } from '../../../types'

const SIZE = 6
const WALL_HEIGHT = 3

export function getTempleBlocks(
  ox: number,
  oy: number,
  oz: number,
): Array<{ bx: number; by: number; bz: number; block: BlockType }> {
  const out: Array<{ bx: number; by: number; bz: number; block: BlockType }> = []
  for (let dx = 0; dx < SIZE; dx++) {
    for (let dz = 0; dz < SIZE; dz++) {
      for (let dy = 0; dy < WALL_HEIGHT; dy++) {
        const bx = ox + dx
        const by = oy + dy
        const bz = oz + dz
        const isFloor = dy === 0
        const isWall = dx === 0 || dx === SIZE - 1 || dz === 0 || dz === SIZE - 1
        const block: BlockType = isFloor || isWall ? 'sandstone' : 'air'
        if (block !== 'air') out.push({ bx, by, bz, block })
      }
    }
  }
  return out
}

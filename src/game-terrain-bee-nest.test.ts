import { describe, expect, it } from 'vitest'
import { getTreeBlocks } from './game-terrain'

const SEARCH_MIN = -20
const SEARCH_MAX = 20
const BASE_Y = 80

describe('meadow bee nest tree generation', () => {
  it('places a deterministic bee nest on some meadow trees', () => {
    let found:
      | {
          wx: number
          wz: number
          beeNest: { x: number; y: number; z: number }
        }
      | null = null

    for (let wx = SEARCH_MIN; wx <= SEARCH_MAX && found === null; wx++) {
      for (let wz = SEARCH_MIN; wz <= SEARCH_MAX; wz++) {
        const tree = getTreeBlocks(wx, BASE_Y, wz, 'meadow')
        if (tree.beeNests.length === 0) continue
        found = { wx, wz, beeNest: tree.beeNests[0] }
        break
      }
    }

    expect(found).not.toBeNull()
    if (found === null) return

    const dx = Math.abs(found.beeNest.x - found.wx)
    const dz = Math.abs(found.beeNest.z - found.wz)
    expect(dx + dz).toBe(1)
    expect(found.beeNest.y).toBeGreaterThan(BASE_Y + 1)
  })

  it('does not place bee nests in non-meadow tree variants', () => {
    for (let wx = -6; wx <= 6; wx++) {
      for (let wz = -6; wz <= 6; wz++) {
        expect(getTreeBlocks(wx, BASE_Y, wz, 'plains').beeNests).toHaveLength(0)
      }
    }
  })
})

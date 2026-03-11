/**
 * Tests for block-materials: snow layer geometry bounds (bottom at Y=0 for correct placement).
 */
import { describe, it, expect } from 'vitest'
import { getSnowLayerGeometry } from './block-materials'
import { BLOCK_SIZE } from './constants'

describe('getSnowLayerGeometry', () => {
  it('snow layer geometry has bottom at local Y=0 and height k/8', () => {
    for (let k = 1; k <= 8; k++) {
      const geo = getSnowLayerGeometry(k)
      geo.computeBoundingBox()
      const box = geo.boundingBox!
      const h = (k / 8) * BLOCK_SIZE
      expect(box.min.y).toBeCloseTo(0, 5)
      expect(box.max.y).toBeCloseTo(h, 5)
      expect(box.min.x).toBeCloseTo(0, 5)
      expect(box.max.x).toBeCloseTo(BLOCK_SIZE, 5)
      expect(box.min.z).toBeCloseTo(0, 5)
      expect(box.max.z).toBeCloseTo(BLOCK_SIZE, 5)
    }
  })
})

/**
 * Tests for block-materials: snow layer geometry bounds (bottom at Y=0 for correct placement).
 */
import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getSnowLayerGeometry,
  loadTextureOptional,
  sharedBlockGeometry,
  sharedTallGrassGeometry,
} from './block-materials'
import { BLOCK_SIZE } from './constants'

const BOUNDING_BOX_PRECISION = 5
const FIRST_CANDIDATE_INDEX = 0
/** Two quads × 4 vertices each in shared tall-grass cross geometry. */
const TALL_GRASS_VERTEX_COUNT = 8

/**
 * Restores all mocked/spied functions after each test.
 */
afterEach(() => {
  vi.restoreAllMocks()
})

describe('shared geometries vertex color buffer', () => {
  /**
   * Asserts white per-vertex colors for materials using `vertexColors: true` with instanced tint.
   */
  function expectWhiteColorMatchesPosition(geo: THREE.BufferGeometry): void {
    const pos = geo.attributes.position
    const col = geo.attributes.color
    expect(col).toBeDefined()
    expect(col!.count).toBe(pos.count)
    expect(col!.itemSize).toBe(3)
    expect(col!.array.length).toBe(pos.count * 3)
    for (let i = 0; i < col!.array.length; i++) {
      expect(col!.array[i]).toBe(1)
    }
  }

  it('sharedBlockGeometry has white color attribute aligned with position count', () => {
    expectWhiteColorMatchesPosition(sharedBlockGeometry)
  })

  it('sharedTallGrassGeometry has white color attribute for eight cross vertices', () => {
    expect(sharedTallGrassGeometry.attributes.position.count).toBe(TALL_GRASS_VERTEX_COUNT)
    expectWhiteColorMatchesPosition(sharedTallGrassGeometry)
  })
})

describe('getSnowLayerGeometry', () => {
  it('snow layer geometry has bottom at local Y=0 and height k/8', () => {
    for (let k = 1; k <= 8; k++) {
      const geo = getSnowLayerGeometry(k)
      geo.computeBoundingBox()
      const box = geo.boundingBox!
      const h = (k / 8) * BLOCK_SIZE
      expect(box.min.y).toBeCloseTo(0, BOUNDING_BOX_PRECISION)
      expect(box.max.y).toBeCloseTo(h, BOUNDING_BOX_PRECISION)
      expect(box.min.x).toBeCloseTo(0, BOUNDING_BOX_PRECISION)
      expect(box.max.x).toBeCloseTo(BLOCK_SIZE, BOUNDING_BOX_PRECISION)
      expect(box.min.z).toBeCloseTo(0, BOUNDING_BOX_PRECISION)
      expect(box.max.z).toBeCloseTo(BLOCK_SIZE, BOUNDING_BOX_PRECISION)
    }
  })
})

describe('loadTextureOptional aliases', () => {
  it('loads dandelion via yellow_flower fallback alias', async () => {
    const loadAsyncSpy = vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation((url: string) => {
      if (url.endsWith('/yellow_flower.png')) return Promise.resolve(new THREE.Texture())
      return Promise.reject(new Error('missing texture'))
    })

    const texture = await loadTextureOptional('dandelion')

    expect(texture).not.toBeNull()
    expect(loadAsyncSpy.mock.calls[FIRST_CANDIDATE_INDEX][0]).toContain('/dandelion.png')
    expect(loadAsyncSpy.mock.calls.some(([url]) => String(url).includes('/yellow_flower.png'))).toBe(true)
  })

  it('loads poppy via rose fallback alias', async () => {
    const loadAsyncSpy = vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation((url: string) => {
      if (url.endsWith('/rose.png')) return Promise.resolve(new THREE.Texture())
      return Promise.reject(new Error('missing texture'))
    })

    const texture = await loadTextureOptional('poppy')

    expect(texture).not.toBeNull()
    expect(loadAsyncSpy.mock.calls[FIRST_CANDIDATE_INDEX][0]).toContain('/poppy.png')
    expect(loadAsyncSpy.mock.calls.some(([url]) => String(url).includes('/rose.png'))).toBe(true)
  })

  it('loads grass block side via dirt fallback alias', async () => {
    const loadAsyncSpy = vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation((url: string) => {
      if (url.endsWith('/dirt.png')) return Promise.resolve(new THREE.Texture())
      return Promise.reject(new Error('missing texture'))
    })

    const texture = await loadTextureOptional('grass_block_side')

    expect(texture).not.toBeNull()
    expect(loadAsyncSpy.mock.calls[FIRST_CANDIDATE_INDEX][0]).toContain('/grass_block_side.png')
    expect(loadAsyncSpy.mock.calls.some(([url]) => String(url).includes('/dirt.png'))).toBe(true)
  })

  it('loads legacy planks_oak via modern oak_planks fallback alias', async () => {
    const loadAsyncSpy = vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation((url: string) => {
      if (url.endsWith('/oak_planks.png')) return Promise.resolve(new THREE.Texture())
      return Promise.reject(new Error('missing texture'))
    })

    const texture = await loadTextureOptional('planks_oak')

    expect(texture).not.toBeNull()
    expect(loadAsyncSpy.mock.calls[FIRST_CANDIDATE_INDEX][0]).toContain('/planks_oak.png')
    expect(loadAsyncSpy.mock.calls.some(([url]) => String(url).includes('/oak_planks.png'))).toBe(true)
  })
})

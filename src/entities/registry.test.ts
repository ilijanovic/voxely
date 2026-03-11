import { describe, it, expect, beforeEach } from 'vitest'
import {
  addEntity,
  removeEntity,
  getEntity,
  getAllEntities,
  entityChunkKey,
  getEntitiesInChunk,
  getEntitiesInRadius,
} from './registry'
import type { Entity } from './types'

function makeEntity(overrides: Partial<Omit<Entity, 'id'>> = {}): Omit<Entity, 'id'> {
  return {
    kind: 'sheep',
    position: { x: 0, y: 64, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    rotationY: 0,
    aabb: { halfX: 0.3, halfZ: 0.2, height: 0.5 },
    state: 'idle',
    stateTime: 0,
    health: 8,
    maxHealth: 8,
    disposition: 'neutral',
    ...overrides,
  }
}

describe('entity registry', () => {
  beforeEach(() => {
    for (const e of [...getAllEntities()]) {
      removeEntity(e.id)
    }
  })

  describe('addEntity / removeEntity', () => {
    it('adds an entity with generated id and retrieves it', () => {
      const e = addEntity(makeEntity())
      expect(e.id).toBeDefined()
      expect(getEntity(e.id)).toBe(e)
      expect(getAllEntities()).toContain(e)
    })

    it('uses provided id when given', () => {
      const e = addEntity({ ...makeEntity(), id: 'custom_1' })
      expect(e.id).toBe('custom_1')
      expect(getEntity('custom_1')).toBe(e)
    })

    it('removes entity by id and returns mesh (undefined when no mesh)', () => {
      const e = addEntity(makeEntity())
      const mesh = removeEntity(e.id)
      expect(mesh).toBeUndefined()
      expect(getEntity(e.id)).toBeUndefined()
      expect(getAllEntities()).not.toContain(e)
    })

    it('round-trips: add then remove leaves registry empty', () => {
      const e1 = addEntity(makeEntity())
      const e2 = addEntity(makeEntity())
      removeEntity(e1.id)
      removeEntity(e2.id)
      expect(getAllEntities()).toHaveLength(0)
    })
  })

  describe('entityChunkKey', () => {
    it('computes correct chunk key for positive coords', () => {
      const e = addEntity(makeEntity({ position: { x: 20, y: 64, z: 35 } }))
      expect(entityChunkKey(e)).toBe('1,2')
    })

    it('computes correct chunk key for negative coords', () => {
      const e = addEntity(makeEntity({ position: { x: -1, y: 64, z: -17 } }))
      expect(entityChunkKey(e)).toBe('-1,-2')
    })

    it('places entity at origin in chunk 0,0', () => {
      const e = addEntity(makeEntity({ position: { x: 8, y: 64, z: 8 } }))
      expect(entityChunkKey(e)).toBe('0,0')
    })
  })

  describe('getEntitiesInChunk', () => {
    it('returns only entities in the specified chunk', () => {
      const e1 = addEntity(makeEntity({ position: { x: 5, y: 64, z: 5 } }))
      const e2 = addEntity(makeEntity({ position: { x: 20, y: 64, z: 5 } }))
      const inChunk = getEntitiesInChunk('0,0')
      expect(inChunk).toContain(e1)
      expect(inChunk).not.toContain(e2)
    })

    it('returns empty array for empty chunk', () => {
      expect(getEntitiesInChunk('99,99')).toHaveLength(0)
    })
  })

  describe('getEntitiesInRadius', () => {
    it('returns entities within squared distance', () => {
      const e1 = addEntity(makeEntity({ position: { x: 3, y: 64, z: 0 } }))
      const e2 = addEntity(makeEntity({ position: { x: 100, y: 64, z: 100 } }))
      const nearby = getEntitiesInRadius(0, 0, 25)
      expect(nearby).toContain(e1)
      expect(nearby).not.toContain(e2)
    })

    it('uses XZ distance only (Y is ignored)', () => {
      const e = addEntity(makeEntity({ position: { x: 1, y: 200, z: 1 } }))
      const nearby = getEntitiesInRadius(0, 0, 4)
      expect(nearby).toContain(e)
    })

    it('returns empty when no entities exist', () => {
      expect(getEntitiesInRadius(0, 0, 1000)).toHaveLength(0)
    })

    it('includes entity exactly at radius boundary', () => {
      const e = addEntity(makeEntity({ position: { x: 3, y: 64, z: 4 } }))
      const nearby = getEntitiesInRadius(0, 0, 25)
      expect(nearby).toContain(e)
    })
  })
})

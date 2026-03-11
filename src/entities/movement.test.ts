import { describe, it, expect, beforeEach, vi } from 'vitest'
import { updateMovement } from './movement'
import { addEntity, removeEntity, getAllEntities } from './registry'
import type { Entity } from './types'

function makeEntity(
  overrides: Partial<Omit<Entity, 'id'>> & { id?: string } = {},
): Omit<Entity, 'id'> & { id?: string } {
  return {
    kind: 'sheep',
    position: { x: 10, y: 64, z: 10 },
    velocity: { x: 0, y: 0, z: 0 },
    rotationY: 0,
    aabb: { halfX: 0.3, halfZ: 0.2, height: 0.5 },
    state: 'idle',
    stateTime: 0,
    health: 8,
    maxHealth: 8,
    ...overrides,
  }
}

describe('updateMovement', () => {
  beforeEach(() => {
    for (const e of [...getAllEntities()]) removeEntity(e.id)
  })

  it('applies gravity to entity velocity.y', () => {
    const e = addEntity(makeEntity({ velocity: { x: 0, y: 0, z: 0 } }))
    const resolveFn = vi.fn()
    updateMovement(1, resolveFn)
    expect(e.velocity.y).toBe(-18)
  })

  it('clamps velocity.y to terminal velocity', () => {
    const e = addEntity(makeEntity({ velocity: { x: 0, y: -20, z: 0 } }))
    const resolveFn = vi.fn()
    updateMovement(1, resolveFn)
    expect(e.velocity.y).toBe(-28)
  })

  it('does not exceed terminal velocity with large dt', () => {
    const e = addEntity(makeEntity({ velocity: { x: 0, y: 0, z: 0 } }))
    const resolveFn = vi.fn()
    updateMovement(10, resolveFn)
    expect(e.velocity.y).toBe(-28)
  })

  it('calls resolveFn with correct AABB parameters', () => {
    const e = addEntity(makeEntity({ aabb: { halfX: 0.3, halfZ: 0.2, height: 0.5 } }))
    const resolveFn = vi.fn()
    updateMovement(0.016, resolveFn)
    expect(resolveFn).toHaveBeenCalledTimes(1)
    expect(resolveFn).toHaveBeenCalledWith(e.position, e.velocity, 0.016, 0.3, 0.2, 0.5)
  })

  it('skips dead entities', () => {
    addEntity(makeEntity({ state: 'dead', velocity: { x: 0, y: 0, z: 0 } }))
    const resolveFn = vi.fn()
    updateMovement(1, resolveFn)
    expect(resolveFn).not.toHaveBeenCalled()
  })

  it('processes multiple entities', () => {
    addEntity(makeEntity({ id: 'm1' }))
    addEntity(makeEntity({ id: 'm2' }))
    addEntity(makeEntity({ id: 'm3' }))
    const resolveFn = vi.fn()
    updateMovement(0.016, resolveFn)
    expect(resolveFn).toHaveBeenCalledTimes(3)
  })

  it('accumulates gravity over multiple frames', () => {
    const e = addEntity(makeEntity({ velocity: { x: 0, y: 0, z: 0 } }))
    const resolveFn = vi.fn()
    updateMovement(0.5, resolveFn)
    expect(e.velocity.y).toBeCloseTo(-9)
    updateMovement(0.5, resolveFn)
    expect(e.velocity.y).toBeCloseTo(-18)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('./entity-defs', () => ({
  getDef: (kind: string) => {
    const defs: Record<
      string,
      {
        walkSpeed: number
        runSpeed: number
        behaviour: 'chase' | 'flee' | 'passive'
        defaultDisposition: 'neutral' | 'friendly' | 'aggro'
        maxHealth: number
      }
    > = {
      sheep: {
        walkSpeed: 1.1,
        runSpeed: 2.7,
        behaviour: 'passive',
        defaultDisposition: 'neutral',
        maxHealth: 8,
      },
      pig: {
        walkSpeed: 1.4,
        runSpeed: 2.6,
        behaviour: 'passive',
        defaultDisposition: 'neutral',
        maxHealth: 10,
      },
      wolf: {
        walkSpeed: 1.6,
        runSpeed: 3.2,
        behaviour: 'chase',
        defaultDisposition: 'aggro',
        maxHealth: 8,
      },
      villager: {
        walkSpeed: 1.0,
        runSpeed: 1.4,
        behaviour: 'passive',
        defaultDisposition: 'friendly',
        maxHealth: 20,
      },
    }
    return (
      defs[kind] ?? {
        walkSpeed: 1,
        runSpeed: 2,
        behaviour: 'passive' as const,
        defaultDisposition: 'neutral' as const,
        maxHealth: 10,
      }
    )
  },
}))

import { updateAI } from './ai'
import { addEntity, removeEntity, getAllEntities } from './registry'
import type { Entity } from './types'

function makeEntity(
  overrides: Partial<Omit<Entity, 'id'>> & { id?: string } = {},
): Omit<Entity, 'id'> & { id?: string } {
  return {
    kind: 'sheep',
    position: { x: 100, y: 64, z: 100 },
    velocity: { x: 0, y: 0, z: 0 },
    rotationY: 0,
    aabb: { halfX: 0.45, halfZ: 0.45, height: 1.3 },
    state: 'idle',
    stateTime: 0,
    health: 8,
    maxHealth: 8,
    disposition: 'neutral',
    ...overrides,
  }
}

describe('updateAI', () => {
  beforeEach(() => {
    for (const e of [...getAllEntities()]) removeEntity(e.id)
  })

  it('skips dead entities', () => {
    const e = addEntity(makeEntity({ state: 'dead', id: 'dead1' }))
    const origTime = e.stateTime
    updateAI({ x: 0, y: 64, z: 0 }, 1, 0)
    expect(e.stateTime).toBe(origTime)
  })

  it('sheep transitions from idle to wander after enough time', () => {
    const e = addEntity(makeEntity({ id: 'sheep_idle', state: 'idle', stateTime: 0 }))
    updateAI({ x: 1000, y: 64, z: 1000 }, 10, 0)
    expect(e.state).toBe('wander')
    expect(e.stateTime).toBe(0)
  })

  it('sheep stays idle when not enough time elapsed', () => {
    const e = addEntity(makeEntity({ id: 'sheep_short', state: 'idle', stateTime: 0 }))
    updateAI({ x: 1000, y: 64, z: 1000 }, 0.01, 0)
    expect(e.state).toBe('idle')
    expect(e.velocity.x).toBe(0)
    expect(e.velocity.z).toBe(0)
  })

  it('sheep transitions from wander to idle after enough time', () => {
    const e = addEntity(
      makeEntity({ id: 'sheep_wander', state: 'wander', stateTime: 0, rotationY: 0.5 }),
    )
    updateAI({ x: 1000, y: 64, z: 1000 }, 10, 0)
    expect(e.state).toBe('idle')
    expect(e.velocity.x).toBe(0)
    expect(e.velocity.z).toBe(0)
  })

  it('sheep does not flee when player is close (passive like Minecraft)', () => {
    const e = addEntity(makeEntity({ id: 'sheep_flee', position: { x: 10, y: 64, z: 10 } }))
    updateAI({ x: 10, y: 64, z: 12 }, 0.1, 0)
    expect(e.state).not.toBe('flee')
  })

  it('sheep flees from a nearby wolf threat', () => {
    const sheep = addEntity(
      makeEntity({ id: 'sheep_wolf_threat', position: { x: 10, y: 64, z: 10 } }),
    )
    addEntity(
      makeEntity({
        id: 'wolf_threat',
        kind: 'wolf',
        disposition: 'neutral',
        position: { x: 10, y: 64, z: 12 },
      }),
    )
    updateAI({ x: 1000, y: 64, z: 1000 }, 0.1, 0)
    expect(sheep.state).toBe('flee')
    expect(sheep.velocity.z).toBeLessThan(0)
  })

  it('sheep stops fleeing when player is far enough', () => {
    const e = addEntity(
      makeEntity({
        id: 'sheep_flee_end',
        state: 'flee',
        stateTime: 0,
        position: { x: 100, y: 64, z: 100 },
      }),
    )
    updateAI({ x: 0, y: 64, z: 0 }, 0.1, 0)
    expect(e.state).toBe('idle')
  })

  it('wolf chases when player is within chase distance and disposition is aggro', () => {
    const e = addEntity(
      makeEntity({
        id: 'wolf_chase',
        kind: 'wolf',
        disposition: 'aggro',
        position: { x: 10, y: 64, z: 10 },
      }),
    )
    updateAI({ x: 14, y: 64, z: 14 }, 0.1, 0)
    expect(e.state).toBe('chase')
    expect(e.velocity.x).toBeGreaterThan(0)
    expect(e.velocity.z).toBeGreaterThan(0)
  })

  it('wolf with neutral disposition does not chase when player is in range', () => {
    const e = addEntity(
      makeEntity({
        id: 'wolf_neutral',
        kind: 'wolf',
        disposition: 'neutral',
        state: 'idle',
        stateTime: 0,
        position: { x: 10, y: 64, z: 10 },
      }),
    )
    updateAI({ x: 14, y: 64, z: 14 }, 0.1, 0)
    expect(e.state).not.toBe('chase')
  })

  it('wolf with friendly disposition does not chase when player is in range', () => {
    const e = addEntity(
      makeEntity({
        id: 'wolf_friendly',
        kind: 'wolf',
        disposition: 'friendly',
        state: 'idle',
        stateTime: 0,
        position: { x: 10, y: 64, z: 10 },
      }),
    )
    updateAI({ x: 14, y: 64, z: 14 }, 0.1, 0)
    expect(e.state).not.toBe('chase')
  })

  it('wolf stops chasing when player moves out of range', () => {
    const e = addEntity(
      makeEntity({
        id: 'wolf_chase_end',
        kind: 'wolf',
        disposition: 'aggro',
        state: 'chase',
        stateTime: 0,
        position: { x: 100, y: 64, z: 100 },
      }),
    )
    updateAI({ x: 0, y: 64, z: 0 }, 0.1, 0)
    expect(e.state).toBe('idle')
  })

  it('is deterministic: same entity id + seed produces same wander direction', () => {
    const e1 = addEntity(makeEntity({ id: 'det_test', state: 'idle', stateTime: 0 }))
    updateAI({ x: 1000, y: 64, z: 1000 }, 10, 0)
    const v1x = e1.velocity.x
    const v1z = e1.velocity.z

    removeEntity(e1.id)
    const e2 = addEntity(makeEntity({ id: 'det_test', state: 'idle', stateTime: 0 }))
    updateAI({ x: 1000, y: 64, z: 1000 }, 10, 0)
    expect(e2.velocity.x).toBe(v1x)
    expect(e2.velocity.z).toBe(v1z)
  })

  it('pig does not flee when player is close (passive)', () => {
    const e = addEntity(
      makeEntity({
        id: 'pig_passive',
        kind: 'pig',
        position: { x: 10, y: 64, z: 10 },
      }),
    )
    updateAI({ x: 10, y: 64, z: 12 }, 0.1, 0)
    expect(e.state).not.toBe('flee')
  })

  it('pig flees when recently damaged and player is close', () => {
    const e = addEntity(
      makeEntity({
        id: 'pig_hit',
        kind: 'pig',
        position: { x: 10, y: 64, z: 10 },
        fleeUntilTime: 100,
      }),
    )
    updateAI({ x: 10, y: 64, z: 12 }, 0.1, 50)
    expect(e.state).toBe('flee')
  })

  it('sheep flees when recently damaged and player is close', () => {
    const e = addEntity(
      makeEntity({
        id: 'sheep_hit',
        kind: 'sheep',
        position: { x: 10, y: 64, z: 10 },
        fleeUntilTime: 100,
      }),
    )
    updateAI({ x: 10, y: 64, z: 12 }, 0.1, 50)
    expect(e.state).toBe('flee')
  })

  it('wolf does not flee (only chases) when aggro', () => {
    const e = addEntity(
      makeEntity({
        id: 'wolf_no_flee',
        kind: 'wolf',
        disposition: 'aggro',
        state: 'idle',
        stateTime: 0,
        position: { x: 10, y: 64, z: 10 },
      }),
    )
    updateAI({ x: 10, y: 64, z: 12 }, 0.1, 0)
    expect(e.state).toBe('chase')
  })
})

import type { Entity } from './types'
import { getAllEntities } from './registry'
import { getDef } from './spawn'

const IDLE_MIN = 2
const IDLE_MAX = 5
const WANDER_DURATION_MIN = 1
const WANDER_DURATION_MAX = 4
const FLEE_DIST_SQ = 8 * 8
const CHASE_DIST_SQ = 12 * 12
/** Seconds a flee-behaviour animal keeps fleeing after being damaged (Minecraft-like). */
export const FLEE_DURATION_AFTER_HIT = 4

/** Simple seeded RNG per entity for deterministic wander direction. */
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0
  return h
}

function entityRng(entity: Entity, seed: number): number {
  const h = hash(entity.id) ^ seed
  const x = Math.sin(h * 9999) * 10000
  return x - Math.floor(x)
}

export function updateAI(
  playerPosition: { x: number; y: number; z: number },
  dt: number,
  time: number,
): void {
  const entities = getAllEntities()
  for (const e of entities) {
    if (e.state === 'dead') continue
    if (e.questGiver) {
      e.state = 'idle'
      e.stateTime = 0
      e.velocity.x = 0
      e.velocity.z = 0
      continue
    }
    const def = getDef(e.kind)
    e.stateTime += dt

    const dx = playerPosition.x - e.position.x
    const dz = playerPosition.z - e.position.z
    const distSq = dx * dx + dz * dz

    if (
      e.disposition === 'aggro' &&
      def.behaviour === 'chase' &&
      distSq < CHASE_DIST_SQ
    ) {
      e.state = 'chase'
      e.stateTime = 0
      const len = Math.sqrt(distSq) || 1
      const vx = (dx / len) * def.runSpeed
      const vz = (dz / len) * def.runSpeed
      e.velocity.x = vx
      e.velocity.z = vz
      e.rotationY = Math.atan2(-dx, -dz)
      continue
    }

    const fleeingFromDamage =
      e.fleeUntilTime != null &&
      time < e.fleeUntilTime &&
      distSq < FLEE_DIST_SQ &&
      (def.behaviour === 'flee' || e.kind === 'pig' || e.kind === 'cow' || e.kind === 'chicken')
    if (fleeingFromDamage) {
      e.state = 'flee'
      e.stateTime = 0
      const len = Math.sqrt(distSq) || 1
      e.velocity.x = (-dx / len) * def.runSpeed
      e.velocity.z = (-dz / len) * def.runSpeed
      e.rotationY = Math.atan2(-dx, -dz)
      continue
    }
    if (def.behaviour === 'flee' && distSq < FLEE_DIST_SQ) {
      e.state = 'flee'
      e.stateTime = 0
      const len = Math.sqrt(distSq) || 1
      e.velocity.x = (-dx / len) * def.runSpeed
      e.velocity.z = (-dz / len) * def.runSpeed
      e.rotationY = Math.atan2(-dx, -dz)
      continue
    }

    switch (e.state) {
      case 'idle': {
        const idleDuration = IDLE_MIN + entityRng(e, 1) * (IDLE_MAX - IDLE_MIN)
        if (e.stateTime >= idleDuration) {
          e.state = 'wander'
          e.stateTime = 0
          const angle = entityRng(e, 2) * Math.PI * 2
          e.rotationY = angle
          e.velocity.x = Math.sin(angle) * def.walkSpeed
          e.velocity.z = Math.cos(angle) * def.walkSpeed
        } else {
          e.velocity.x = 0
          e.velocity.z = 0
        }
        break
      }
      case 'wander':
      case 'walk': {
        const wanderDuration =
          WANDER_DURATION_MIN + entityRng(e, 3) * (WANDER_DURATION_MAX - WANDER_DURATION_MIN)
        if (e.stateTime >= wanderDuration) {
          e.state = 'idle'
          e.stateTime = 0
          e.velocity.x = 0
          e.velocity.z = 0
        } else {
          e.velocity.x = Math.sin(e.rotationY) * def.walkSpeed
          e.velocity.z = Math.cos(e.rotationY) * def.walkSpeed
        }
        break
      }
      case 'flee': {
        if (distSq >= FLEE_DIST_SQ) {
          e.state = 'idle'
          e.stateTime = 0
          e.velocity.x = 0
          e.velocity.z = 0
        }
        break
      }
      case 'chase': {
        if (distSq >= CHASE_DIST_SQ) {
          e.state = 'idle'
          e.stateTime = 0
          e.velocity.x = 0
          e.velocity.z = 0
        }
        break
      }
      default:
        break
    }
  }
}

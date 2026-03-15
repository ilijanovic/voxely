import type { AnimalBehaviour, AnimalKind, Entity } from './types'
import { getAllEntities } from './registry'
import { getDef } from './entity-defs'

const IDLE_MIN = 2
const IDLE_MAX = 5
const WANDER_DURATION_MIN = 1
const WANDER_DURATION_MAX = 4
const FLEE_DIST_SQ = 8 * 8
const CHASE_DIST_SQ = 12 * 12
const DAMAGE_PANIC_DIST_SQ = 8 * 8
const SHEEP_WOLF_THREAT_DIST_SQ = 10 * 10
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

interface ThreatVector {
  dx: number
  dz: number
  distSq: number
}

/**
 * Returns true when this mob kind should panic-run after being hit.
 * Sheep are passive toward players in vanilla, but still panic when damaged.
 */
function isDamagePanicKind(kind: AnimalKind, behaviour: AnimalBehaviour): boolean {
  return (
    behaviour === 'flee' ||
    kind === 'sheep' ||
    kind === 'pig' ||
    kind === 'cow' ||
    kind === 'chicken'
  )
}

/**
 * Finds the nearest living wolf around a sheep.
 *
 * @param sheep - Sheep entity to evaluate
 * @param entities - Current entity list
 * @returns Vector from sheep to wolf, or null when no nearby wolf exists
 */
function findNearestWolfThreat(sheep: Entity, entities: Entity[]): ThreatVector | null {
  let closest: ThreatVector | null = null
  for (const other of entities) {
    if (other.id === sheep.id || other.state === 'dead' || other.kind !== 'wolf') continue
    const dx = other.position.x - sheep.position.x
    const dz = other.position.z - sheep.position.z
    const distSq = dx * dx + dz * dz
    if (distSq >= SHEEP_WOLF_THREAT_DIST_SQ) continue
    if (closest == null || distSq < closest.distSq) {
      closest = { dx, dz, distSq }
    }
  }
  return closest
}

/**
 * Applies flee velocity away from a threat vector.
 *
 * @param entity - Entity that should flee
 * @param runSpeed - Movement speed while fleeing
 * @param dx - Threat X minus entity X
 * @param dz - Threat Z minus entity Z
 */
function applyFleeVelocity(entity: Entity, runSpeed: number, dx: number, dz: number): void {
  const distSq = dx * dx + dz * dz
  const len = Math.sqrt(distSq) || 1
  entity.state = 'flee'
  entity.stateTime = 0
  entity.velocity.x = (-dx / len) * runSpeed
  entity.velocity.z = (-dz / len) * runSpeed
  entity.rotationY = Math.atan2(-dx, -dz)
}

/**
 * Updates one frame of simple mob AI (idle, wander, flee, chase).
 * Sheep are passive toward nearby players, panic when damaged, and flee nearby wolves.
 */
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
    const wolfThreat = e.kind === 'sheep' ? findNearestWolfThreat(e, entities) : null

    if (wolfThreat != null) {
      applyFleeVelocity(e, def.runSpeed, wolfThreat.dx, wolfThreat.dz)
      continue
    }

    if (e.disposition === 'aggro' && def.behaviour === 'chase' && distSq < CHASE_DIST_SQ) {
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
      distSq < DAMAGE_PANIC_DIST_SQ &&
      isDamagePanicKind(e.kind, def.behaviour)
    if (fleeingFromDamage) {
      applyFleeVelocity(e, def.runSpeed, dx, dz)
      continue
    }

    if (def.behaviour === 'flee' && distSq < FLEE_DIST_SQ) {
      applyFleeVelocity(e, def.runSpeed, dx, dz)
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

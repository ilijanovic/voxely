/** Biome for spawn logic – from world types to stay in sync. */
import type { Biome } from '../types'
export type { Biome }

/** Animal kinds: sheep, pig, wolf (staged). */
export type AnimalKind = 'sheep' | 'pig' | 'wolf'

/** AABB for collision: half extents in XZ and full height in Y. */
export interface EntityAABB {
  halfX: number
  halfZ: number
  height: number
}

/** AI states – used differently per animal kind. */
export type EntityState = 'idle' | 'wander' | 'walk' | 'flee' | 'chase' | 'dead'

/** Entity data – no THREE references so it stays serializable for future multiplayer. */
export interface Entity {
  id: string
  kind: AnimalKind
  position: { x: number; y: number; z: number }
  velocity: { x: number; y: number; z: number }
  rotationY: number
  aabb: EntityAABB
  state: EntityState
  stateTime: number
  /** Current health; entity is dead when health <= 0. */
  health: number
  /** Maximum health (set from AnimalDef at spawn). */
  maxHealth: number
  /** When set, entity flees from player until this time (e.g. after being hit). Used for pig. */
  fleeUntilTime?: number
}

/** AI behaviour when player is near: chase, flee, or passive (no reaction). */
export type AnimalBehaviour = 'chase' | 'flee' | 'passive'

/** Per-kind config: speeds, spawn biomes, cap per chunk, AI behaviour, and health. */
export interface AnimalDef {
  kind: AnimalKind
  aabb: EntityAABB
  walkSpeed: number
  runSpeed: number
  spawnBiomes: Biome[]
  maxPerChunk: number
  /** How the animal reacts to the player (chase = wolf, flee = sheep/pig, passive = no reaction). */
  behaviour: AnimalBehaviour
  /** Maximum health (e.g. 10 for pig). */
  maxHealth: number
}

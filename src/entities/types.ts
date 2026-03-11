/** Biome for spawn logic – from world types to stay in sync. */
import type { Biome } from '../types'
export type { Biome }

/** Animal kinds: sheep, pig, wolf, villager (villager spawns only in villages). */
export type AnimalKind = 'sheep' | 'pig' | 'wolf' | 'villager'

/** AABB for collision: half extents in XZ and full height in Y. */
export interface EntityAABB {
  halfX: number
  halfZ: number
  height: number
}

/** AI states – used differently per animal kind. */
export type EntityState = 'idle' | 'wander' | 'walk' | 'flee' | 'chase' | 'dead'

/** Mob attitude: aggro = attack in range, neutral = attack only after being hit, friendly = cannot be attacked. */
export type MobDisposition = 'neutral' | 'friendly' | 'aggro'

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
  /** Aggro = attack when player in range; neutral = attack only after hit; friendly = cannot be attacked. */
  disposition: MobDisposition
  /** When set, entity flees from player until this time (e.g. after being hit). Used for pig. */
  fleeUntilTime?: number
  /** Mob level (from area); used for XP scaling and display. */
  level?: number
}

/** AI behaviour when player is near: chase, flee, or passive (no reaction). */
export type AnimalBehaviour = 'chase' | 'flee' | 'passive'

/** Per-kind config: speeds, spawn biomes, cap per chunk, AI behaviour, disposition, and health. */
export interface AnimalDef {
  kind: AnimalKind
  aabb: EntityAABB
  walkSpeed: number
  runSpeed: number
  spawnBiomes: Biome[]
  maxPerChunk: number
  /** How the animal reacts to the player (chase = wolf, flee = sheep/pig, passive = no reaction). */
  behaviour: AnimalBehaviour
  /** Default disposition at spawn (aggro = attack in range, neutral = react after hit, friendly = not attackable). */
  defaultDisposition: MobDisposition
  /** Maximum health (e.g. 10 for pig). */
  maxHealth: number
}

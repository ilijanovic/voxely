import type { AnimalDef, AnimalKind } from './types'
import type { Biome } from '../types'
import {
  CREATURE_SPAWN_PROBABILITY,
  DEFAULT_CREATURE_SPAWN_PROBABILITY,
} from './spawn-constants'

/** Effective natural-spawn config after applying defaults for weight and group size. */
export interface WeightedCreatureSpawnDef {
  def: AnimalDef
  weight: number
  groupMin: number
  groupMax: number
}

export const ANIMAL_DEFS: AnimalDef[] = [
  {
    kind: 'sheep',
    aabb: { halfX: 0.3, halfZ: 0.2, height: 0.5 },
    walkSpeed: 1.2,
    runSpeed: 2.8,
    spawnBiomes: ['plains', 'forest', 'jungle', 'meadow', 'savanna'],
    maxPerChunk: 1,
    behaviour: 'flee',
    defaultDisposition: 'neutral',
    maxHealth: 8,
    spawnWeight: 10,
    spawnGroupMin: 1,
    spawnGroupMax: 2,
  },
  {
    kind: 'pig',
    aabb: { halfX: 0.45, halfZ: 0.3, height: 0.9 },
    walkSpeed: 1.4,
    runSpeed: 2.6,
    spawnBiomes: ['plains', 'forest', 'jungle', 'meadow', 'savanna'],
    maxPerChunk: 1,
    behaviour: 'passive',
    defaultDisposition: 'neutral',
    maxHealth: 10,
    spawnWeight: 10,
    spawnGroupMin: 1,
    spawnGroupMax: 2,
  },
  {
    kind: 'cow',
    aabb: { halfX: 0.5, halfZ: 0.35, height: 1.0 },
    walkSpeed: 1.0,
    runSpeed: 2.2,
    spawnBiomes: ['plains', 'forest', 'jungle', 'meadow', 'savanna'],
    maxPerChunk: 1,
    behaviour: 'flee',
    defaultDisposition: 'neutral',
    maxHealth: 10,
    spawnWeight: 8,
    spawnGroupMin: 1,
    spawnGroupMax: 3,
  },
  {
    kind: 'chicken',
    aabb: { halfX: 0.2, halfZ: 0.15, height: 0.4 },
    walkSpeed: 1.2,
    runSpeed: 2.0,
    spawnBiomes: ['plains', 'forest', 'jungle', 'meadow', 'savanna'],
    maxPerChunk: 1,
    behaviour: 'flee',
    defaultDisposition: 'neutral',
    maxHealth: 4,
    spawnWeight: 10,
    spawnGroupMin: 2,
    spawnGroupMax: 4,
  },
  {
    kind: 'horse',
    aabb: { halfX: 0.5, halfZ: 0.4, height: 1.3 },
    walkSpeed: 1.5,
    runSpeed: 3.0,
    spawnBiomes: ['plains', 'savanna'],
    maxPerChunk: 1,
    behaviour: 'passive',
    defaultDisposition: 'neutral',
    maxHealth: 15,
    spawnWeight: 5,
    spawnGroupMin: 1,
    spawnGroupMax: 2,
  },
  {
    kind: 'wolf',
    aabb: { halfX: 0.35, halfZ: 0.25, height: 0.55 },
    walkSpeed: 1.6,
    runSpeed: 3.2,
    spawnBiomes: ['forest', 'mountain', 'snow', 'grove'],
    maxPerChunk: 1,
    behaviour: 'chase',
    defaultDisposition: 'aggro',
    maxHealth: 8,
    spawnWeight: 5,
    spawnGroupMin: 1,
    spawnGroupMax: 2,
  },
  {
    kind: 'villager',
    aabb: { halfX: 0.3, halfZ: 0.3, height: 1.8 },
    walkSpeed: 1.0,
    runSpeed: 1.4,
    spawnBiomes: [],
    maxPerChunk: 0,
    behaviour: 'passive',
    defaultDisposition: 'friendly',
    maxHealth: 20,
  },
  {
    kind: 'zombie',
    aabb: { halfX: 0.3, halfZ: 0.3, height: 1.9 },
    walkSpeed: 0.9,
    runSpeed: 2.2,
    spawnBiomes: ['plains', 'forest', 'savanna'],
    maxPerChunk: 1,
    behaviour: 'chase',
    defaultDisposition: 'aggro',
    maxHealth: 20,
    spawnWeight: 3,
    spawnGroupMin: 1,
    spawnGroupMax: 2,
  },
]

const ANIMAL_DEFS_BY_KIND = new Map<AnimalKind, AnimalDef>(
  ANIMAL_DEFS.map((def) => [def.kind, def]),
)

/** Default weight when spawnWeight is not set on AnimalDef. */
const DEFAULT_SPAWN_WEIGHT = 10
/** Default min/max group size when not set. */
const DEFAULT_SPAWN_GROUP_MIN = 1
const DEFAULT_SPAWN_GROUP_MAX = 2

/**
 * Returns the registered definition for an animal kind.
 *
 * @param kind - Animal kind to look up
 * @returns The immutable definition for that kind
 * @throws When the kind is not registered
 */
export function getDef(kind: AnimalKind): AnimalDef {
  const def = ANIMAL_DEFS_BY_KIND.get(kind)
  if (!def) throw new Error(`Unknown animal kind: ${kind}`)
  return def
}

/**
 * Returns the natural creature spawn probability for a biome.
 *
 * @param biome - Representative biome for the chunk
 * @returns Probability in [0, 1]
 */
export function getCreatureSpawnProbability(biome: Biome): number {
  return CREATURE_SPAWN_PROBABILITY[biome] ?? DEFAULT_CREATURE_SPAWN_PROBABILITY
}

/**
 * Returns the natural-spawn candidates for a biome with defaults materialized.
 *
 * @param biome - Biome to inspect
 * @returns Weighted creature definitions for that biome
 */
export function getCreatureDefsForBiome(biome: Biome): WeightedCreatureSpawnDef[] {
  return ANIMAL_DEFS.filter((def) => def.spawnBiomes.length > 0 && def.spawnBiomes.includes(biome)).map(
    (def) => ({
      def,
      weight: def.spawnWeight ?? DEFAULT_SPAWN_WEIGHT,
      groupMin: def.spawnGroupMin ?? DEFAULT_SPAWN_GROUP_MIN,
      groupMax: def.spawnGroupMax ?? DEFAULT_SPAWN_GROUP_MAX,
    }),
  )
}

/**
 * Picks one weighted entry using the provided RNG.
 *
 * @param entries - Candidate entries with effective weights
 * @param rng - Deterministic random source
 * @returns Picked entry or null when no valid entry exists
 */
export function pickWeightedCreature(
  entries: WeightedCreatureSpawnDef[],
  rng: () => number,
): WeightedCreatureSpawnDef | null {
  if (entries.length === 0) return null
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  if (total <= 0) return null

  let remaining = rng() * total
  for (const entry of entries) {
    remaining -= entry.weight
    if (remaining <= 0) return entry
  }

  return entries[entries.length - 1]
}

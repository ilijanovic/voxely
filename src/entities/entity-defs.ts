import type { Biome } from '../types'
import type { AnimalDef, AnimalKind } from './types'
import {
  CREATURE_SPAWN_PROBABILITY,
  DEFAULT_CREATURE_SPAWN_PROBABILITY,
} from './spawn-constants'

export interface WeightedCreatureEntry {
  def: AnimalDef
  weight: number
  groupMin: number
  groupMax: number
}

/**
 * Default per-kind entity definitions.
 * These values are gameplay-tuned (movement, health, group sizes) and kept small/simple.
 */
export const ANIMAL_DEFS: Record<AnimalKind, AnimalDef> = {
  sheep: {
    kind: 'sheep',
    aabb: { halfX: 0.45, halfZ: 0.45, height: 1.3 },
    walkSpeed: 1.1,
    runSpeed: 2.7,
    spawnBiomes: ['plains', 'forest', 'meadow', 'savanna'],
    maxPerChunk: 6,
    behaviour: 'passive',
    defaultDisposition: 'neutral',
    maxHealth: 8,
    spawnWeight: 12,
    spawnGroupMin: 2,
    spawnGroupMax: 4,
  },
  pig: {
    kind: 'pig',
    aabb: { halfX: 0.45, halfZ: 0.45, height: 1.2 },
    walkSpeed: 1.4,
    runSpeed: 2.6,
    spawnBiomes: ['plains', 'forest', 'savanna'],
    maxPerChunk: 5,
    behaviour: 'passive',
    defaultDisposition: 'neutral',
    maxHealth: 10,
    spawnWeight: 10,
    spawnGroupMin: 2,
    spawnGroupMax: 3,
  },
  cow: {
    kind: 'cow',
    aabb: { halfX: 0.5, halfZ: 0.5, height: 1.4 },
    walkSpeed: 1.2,
    runSpeed: 2.4,
    spawnBiomes: ['plains', 'forest', 'meadow'],
    maxPerChunk: 4,
    behaviour: 'passive',
    defaultDisposition: 'neutral',
    maxHealth: 10,
    spawnWeight: 8,
    spawnGroupMin: 2,
    spawnGroupMax: 3,
  },
  chicken: {
    kind: 'chicken',
    aabb: { halfX: 0.3, halfZ: 0.3, height: 0.9 },
    walkSpeed: 1.6,
    runSpeed: 2.4,
    spawnBiomes: ['plains', 'forest', 'jungle'],
    maxPerChunk: 6,
    behaviour: 'passive',
    defaultDisposition: 'neutral',
    maxHealth: 6,
    spawnWeight: 10,
    spawnGroupMin: 2,
    spawnGroupMax: 4,
  },
  horse: {
    kind: 'horse',
    aabb: { halfX: 0.6, halfZ: 0.6, height: 1.6 },
    walkSpeed: 1.5,
    runSpeed: 3.3,
    spawnBiomes: ['plains', 'savanna'],
    maxPerChunk: 2,
    behaviour: 'passive',
    defaultDisposition: 'neutral',
    maxHealth: 14,
    spawnWeight: 3,
    spawnGroupMin: 1,
    spawnGroupMax: 2,
  },
  donkey: {
    kind: 'donkey',
    aabb: { halfX: 0.55, halfZ: 0.55, height: 1.5 },
    walkSpeed: 1.4,
    runSpeed: 3.0,
    spawnBiomes: ['meadow', 'mountain'],
    maxPerChunk: 2,
    behaviour: 'passive',
    defaultDisposition: 'neutral',
    maxHealth: 14,
    spawnWeight: 2,
    spawnGroupMin: 1,
    spawnGroupMax: 2,
  },
  rabbit: {
    kind: 'rabbit',
    aabb: { halfX: 0.28, halfZ: 0.28, height: 0.7 },
    walkSpeed: 1.6,
    runSpeed: 3.4,
    spawnBiomes: ['desert', 'snow', 'meadow'],
    maxPerChunk: 4,
    behaviour: 'flee',
    defaultDisposition: 'neutral',
    maxHealth: 6,
    spawnWeight: 3,
    spawnGroupMin: 1,
    spawnGroupMax: 2,
  },
  wolf: {
    kind: 'wolf',
    aabb: { halfX: 0.4, halfZ: 0.4, height: 1.2 },
    walkSpeed: 1.6,
    runSpeed: 3.2,
    spawnBiomes: ['forest', 'old_growth_taiga', 'grove'],
    maxPerChunk: 2,
    behaviour: 'chase',
    defaultDisposition: 'aggro',
    maxHealth: 8,
    spawnWeight: 2,
    spawnGroupMin: 1,
    spawnGroupMax: 2,
  },
  villager: {
    kind: 'villager',
    aabb: { halfX: 0.35, halfZ: 0.35, height: 1.7 },
    walkSpeed: 1.0,
    runSpeed: 1.4,
    spawnBiomes: [],
    maxPerChunk: 0,
    behaviour: 'passive',
    defaultDisposition: 'friendly',
    maxHealth: 20,
    spawnWeight: 0,
    spawnGroupMin: 1,
    spawnGroupMax: 1,
  },
  zombie: {
    kind: 'zombie',
    aabb: { halfX: 0.35, halfZ: 0.35, height: 1.8 },
    walkSpeed: 1.1,
    runSpeed: 2.0,
    spawnBiomes: [],
    maxPerChunk: 0,
    behaviour: 'chase',
    defaultDisposition: 'aggro',
    maxHealth: 16,
    spawnWeight: 0,
    spawnGroupMin: 1,
    spawnGroupMax: 1,
  },
}

/**
 * Returns the entity definition for a kind.
 *
 * @param kind - Entity kind
 * @returns Animal definition
 */
export function getDef(kind: AnimalKind): AnimalDef {
  return ANIMAL_DEFS[kind]
}

/**
 * Returns Minecraft-style passive creature spawn probability for a biome.
 *
 * @param biome - Biome id
 * @returns Probability in [0,1]
 */
export function getCreatureSpawnProbability(biome: Biome): number {
  return CREATURE_SPAWN_PROBABILITY[biome] ?? DEFAULT_CREATURE_SPAWN_PROBABILITY
}

/**
 * Returns weighted creature definitions valid for a biome.
 *
 * @param biome - Biome id
 * @returns Weighted entries, stable order
 */
export function getCreatureDefsForBiome(biome: Biome): WeightedCreatureEntry[] {
  const out: WeightedCreatureEntry[] = []
  for (const def of Object.values(ANIMAL_DEFS)) {
    if (def.spawnBiomes.length === 0) continue
    if (!def.spawnBiomes.includes(biome)) continue
    out.push({
      def,
      weight: def.spawnWeight ?? 10,
      groupMin: def.spawnGroupMin ?? 1,
      groupMax: def.spawnGroupMax ?? 2,
    })
  }
  // Stable sort for deterministic picks when weights match.
  out.sort((a, b) => a.def.kind.localeCompare(b.def.kind))
  return out
}

/**
 * Picks one creature definition by weight.
 *
 * @param entries - Weighted entries
 * @param rng - Random generator returning floats in [0,1)
 * @returns Picked entry or null when entries empty or invalid
 */
export function pickWeightedCreature(
  entries: WeightedCreatureEntry[],
  rng: () => number,
): WeightedCreatureEntry | null {
  if (entries.length === 0) return null
  let total = 0
  for (const e of entries) total += Math.max(0, e.weight)
  if (total <= 0) return entries[0] ?? null
  let r = rng() * total
  for (const e of entries) {
    r -= Math.max(0, e.weight)
    if (r <= 0) return e
  }
  return entries[entries.length - 1] ?? null
}


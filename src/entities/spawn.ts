import * as THREE from '@/three'
import type { Entity, AnimalKind, AnimalDef } from './types'
import { addEntity, removeEntity, getEntitiesInChunk } from './registry'
import { createAnimalMesh } from './meshes'
import { getWorldApi } from '../world-api'
import { CHUNK_SIZE } from '../constants'
import { getStructureOriginsInChunk } from '../terrain/structures/origins'
import { getHeight, getResolvedBiome, WORLD_SEED } from '../game-terrain'
import { getAreaAt, getRandomMobLevelInArea } from '../world-areas'
import {
  getActivePois,
  getFixedVillageOriginsInChunk,
  getFixedSpawnsInChunk,
} from '../world-pois'
import {
  getZonesOverlappingChunk,
  getKindsSpawnedByZonesInChunk,
  getSpawnPositionOnRing,
  SHEEP_FORBIDDEN_BIOMES,
} from '../creature-zones'
import {
  createQuestNpcIcon,
  registerQuestNpcSprite,
  unregisterAndDisposeQuestNpcSprite,
} from './quest-npc-icon'
import {
  CREATURE_SPAWN_PROBABILITY,
  DEFAULT_CREATURE_SPAWN_PROBABILITY,
  CREATURE_SPAWN_SURFACE_BLOCKS,
  CREATURE_SPAWN_POSITION_ATTEMPTS,
  HOSTILE_SPAWN_MAX_LIGHT,
} from './spawn-constants'
import { isNight } from '../atmosphere'
import type { Biome } from '../types'

/** Min and max number of villagers to spawn per village (deterministic per village origin). */
const VILLAGERS_PER_VILLAGE_MIN = 1
const VILLAGERS_PER_VILLAGE_MAX = 2
/** Max block offset in X/Z from village center for villager spawn position. */
const VILLAGE_SPAWN_OFFSET_RADIUS = 3

/** Deterministic seeded RNG for chunk spawn (same chunk + kind = same count/positions). */
function makeChunkRng(chunkKey: string, kind: AnimalKind): () => number {
  let seed = 0
  for (let i = 0; i < chunkKey.length; i++) seed = (seed << 5) - seed + chunkKey.charCodeAt(i)
  seed += kind.length * 31
  seed = Math.imul(seed, 0x7fffffff) >>> 0
  return function () {
    seed = Math.imul(seed, 1103515245) + 12345
    return ((seed >>> 0) % 0x7fffffff) / 0x7fffffff
  }
}

/** Deterministic RNG for creature zone spawn (chunkKey + zone id). */
function makeZoneChunkRng(chunkKey: string, zoneId: string): () => number {
  let seed = 0
  for (let i = 0; i < chunkKey.length; i++) seed = (seed << 5) - seed + chunkKey.charCodeAt(i)
  for (let i = 0; i < zoneId.length; i++) seed = (seed << 5) - seed + zoneId.charCodeAt(i)
  seed = Math.imul(seed, 0x7fffffff) >>> 0
  return function () {
    seed = Math.imul(seed, 1103515245) + 12345
    return ((seed >>> 0) % 0x7fffffff) / 0x7fffffff
  }
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
    kind: 'wolf',
    aabb: { halfX: 0.35, halfZ: 0.25, height: 0.55 },
    walkSpeed: 1.6,
    runSpeed: 3.2,
    spawnBiomes: ['forest', 'jungle', 'mountain', 'snow', 'grove'],
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
  {
    kind: 'skeleton',
    aabb: { halfX: 0.3, halfZ: 0.3, height: 1.99 },
    walkSpeed: 1.0,
    runSpeed: 2.4,
    spawnBiomes: ['plains', 'forest', 'savanna', 'desert'],
    maxPerChunk: 1,
    behaviour: 'chase',
    defaultDisposition: 'aggro',
    maxHealth: 20,
    spawnWeight: 2,
    spawnGroupMin: 1,
    spawnGroupMax: 2,
  },
  {
    kind: 'creeper',
    aabb: { halfX: 0.3, halfZ: 0.3, height: 1.7 },
    walkSpeed: 0.8,
    runSpeed: 1.8,
    spawnBiomes: ['plains', 'forest', 'savanna', 'jungle'],
    maxPerChunk: 1,
    behaviour: 'chase',
    defaultDisposition: 'aggro',
    maxHealth: 20,
    spawnWeight: 2,
    spawnGroupMin: 1,
    spawnGroupMax: 1,
  },
]

function getDef(kind: AnimalKind): AnimalDef {
  const d = ANIMAL_DEFS.find((x) => x.kind === kind)
  if (!d) throw new Error('Unknown animal kind: ' + kind)
  return d
}

/** Default weight when spawnWeight is not set on AnimalDef. */
const DEFAULT_SPAWN_WEIGHT = 10
/** Default min/max group size when not set. */
const DEFAULT_SPAWN_GROUP_MIN = 1
const DEFAULT_SPAWN_GROUP_MAX = 2

/**
 * Returns the biome used for this chunk's creature spawn decision (Minecraft: one representative per chunk).
 */
function getChunkRepresentativeBiome(
  chunkX: number,
  chunkZ: number,
  getBiome: (x: number, z: number) => Biome,
): Biome {
  const worldX = chunkX * CHUNK_SIZE + CHUNK_SIZE / 2
  const worldZ = chunkZ * CHUNK_SIZE + CHUNK_SIZE / 2
  return getBiome(worldX, worldZ)
}

/**
 * Returns creature spawn probability for the given biome (0 = no spawns).
 */
function getCreatureSpawnProbability(biome: Biome): number {
  return CREATURE_SPAWN_PROBABILITY[biome] ?? DEFAULT_CREATURE_SPAWN_PROBABILITY
}

/**
 * Defs that can spawn in the given biome, with effective weight and group size for weighted pick.
 */
function getCreatureDefsForBiome(biome: Biome): Array<{ def: AnimalDef; weight: number; groupMin: number; groupMax: number }> {
  return ANIMAL_DEFS.filter((d) => d.spawnBiomes.length > 0 && d.spawnBiomes.includes(biome)).map(
    (def) => ({
      def,
      weight: def.spawnWeight ?? DEFAULT_SPAWN_WEIGHT,
      groupMin: def.spawnGroupMin ?? DEFAULT_SPAWN_GROUP_MIN,
      groupMax: def.spawnGroupMax ?? DEFAULT_SPAWN_GROUP_MAX,
    }),
  )
}

/**
 * Picks one entry from the weighted list (deterministic with given rng).
 */
function pickWeightedCreature(
  entries: Array<{ def: AnimalDef; weight: number; groupMin: number; groupMax: number }>,
  rng: () => number,
): typeof entries[0] | null {
  if (entries.length === 0) return null
  const total = entries.reduce((s, e) => s + e.weight, 0)
  if (total <= 0) return null
  let r = rng() * total
  for (const e of entries) {
    r -= e.weight
    if (r <= 0) return e
  }
  return entries[entries.length - 1]
}

/** Deterministic RNG for natural (Minecraft-style) creature spawn loop (chunkKey only). */
function makeNaturalSpawnRng(chunkKey: string): () => number {
  let seed = 0
  for (let i = 0; i < chunkKey.length; i++) seed = (seed << 5) - seed + chunkKey.charCodeAt(i)
  seed += 31 * 7 // "creature"
  seed = Math.imul(seed, 0x7fffffff) >>> 0
  return function () {
    seed = Math.imul(seed, 1103515245) + 12345
    return ((seed >>> 0) % 0x7fffffff) / 0x7fffffff
  }
}

/**
 * Spawn entities for a newly loaded chunk. Deterministic per chunk.
 * Uses world-api for getSurfaceY, getBiome, getBlockAt. Natural spawn uses Minecraft-style chunk biome + probability + weighted creature pick.
 */
export function spawnEntitiesForChunk(
  scene: THREE.Scene,
  chunkKey: string,
  chunkX: number,
  chunkZ: number,
): void {
  const api = getWorldApi()
  const worldX = chunkX * CHUNK_SIZE
  const worldZ = chunkZ * CHUNK_SIZE

  const kindsSpawnedByZones = getKindsSpawnedByZonesInChunk(chunkX, chunkZ)

  for (const zone of getZonesOverlappingChunk(chunkX, chunkZ)) {
    const def = getDef(zone.kind)
    const rng = makeZoneChunkRng(chunkKey, zone.id)
    const count = Math.floor(rng() * (zone.maxPerChunk + 1))
    for (let i = 0; i < count; i++) {
      let wx: number
      let wz: number
      if (zone.ringRadius != null) {
        const pos = getSpawnPositionOnRing(zone, rng)
        wx = pos.x
        wz = pos.z
      } else {
        const maxTries = 20
        wx = 0
        wz = 0
        for (let t = 0; t < maxTries; t++) {
          wx = worldX + 2 + rng() * (CHUNK_SIZE - 4)
          wz = worldZ + 2 + rng() * (CHUNK_SIZE - 4)
          const dx = wx - zone.centerX
          const dz = wz - zone.centerZ
          if (dx * dx + dz * dz <= zone.radius * zone.radius) break
        }
        const dx = wx - zone.centerX
        const dz = wz - zone.centerZ
        if (dx * dx + dz * dz > zone.radius * zone.radius) continue
      }
      if (zone.kind === 'sheep' && SHEEP_FORBIDDEN_BIOMES.has(api.getBiome(wx, wz))) continue
      const y = api.getColumnSurfaceY(wx, wz)
      const area = getAreaAt(wx, wz)
      const level = area ? getRandomMobLevelInArea(area) : undefined
      const entity: Omit<Entity, 'id'> = {
        kind: zone.kind,
        position: { x: wx, y: y, z: wz },
        velocity: { x: 0, y: 0, z: 0 },
        rotationY: 0,
        aabb: { ...def.aabb },
        state: 'idle',
        stateTime: 0,
        health: def.maxHealth,
        maxHealth: def.maxHealth,
        disposition: zone.dispositionOverride ?? def.defaultDisposition,
        level,
        spawnHome: { x: wx, z: wz },
        ...(zone.wanderRadius != null ? { wanderRadius: zone.wanderRadius } : {}),
      }
      const mesh = createAnimalMesh(zone.kind)
      mesh.position.set(entity.position.x, entity.position.y, entity.position.z)
      scene.add(mesh)
      addEntity(entity, mesh)
    }
  }

  const chunkBiome = getChunkRepresentativeBiome(chunkX, chunkZ, api.getBiome.bind(api))
  const probability = getCreatureSpawnProbability(chunkBiome)
  const weightedDefs = getCreatureDefsForBiome(chunkBiome).filter(
    (e) => !kindsSpawnedByZones.has(e.def.kind),
  )

  if (probability > 0 && weightedDefs.length > 0) {
    const rng = makeNaturalSpawnRng(chunkKey)
    for (;;) {
      if (rng() >= probability) break
      const entry = pickWeightedCreature(weightedDefs, rng)
      if (!entry) break
      const { def } = entry
      const groupSize = Math.min(
        entry.groupMax,
        Math.max(
          entry.groupMin,
          entry.groupMin + Math.floor(rng() * (entry.groupMax - entry.groupMin + 1)),
        ),
      )
      for (let g = 0; g < groupSize; g++) {
        let spawned = false
        for (let t = 0; t < CREATURE_SPAWN_POSITION_ATTEMPTS && !spawned; t++) {
          const wx = worldX + 2 + rng() * (CHUNK_SIZE - 4)
          const wz = worldZ + 2 + rng() * (CHUNK_SIZE - 4)
          const posBiome = api.getBiome(wx, wz)
          if (!def.spawnBiomes.includes(posBiome)) continue
          const y = api.getColumnSurfaceY(wx, wz)
          if (def.defaultDisposition === 'aggro') {
            if (!isNight()) continue
            const light = api.getBlockLightAt?.(wx, y, wz) ?? 0
            if (light > HOSTILE_SPAWN_MAX_LIGHT) continue
          }
          const block = api.getBlockAt(wx, y, wz)
          if (block !== 'air' && block !== null && !CREATURE_SPAWN_SURFACE_BLOCKS.has(block)) continue
          const area = getAreaAt(wx, wz)
          const level = area ? getRandomMobLevelInArea(area) : undefined
          const entity: Omit<Entity, 'id'> = {
            kind: def.kind,
            position: { x: wx, y: y, z: wz },
            velocity: { x: 0, y: 0, z: 0 },
            rotationY: 0,
            aabb: { ...def.aabb },
            state: 'idle',
            stateTime: 0,
            health: def.maxHealth,
            maxHealth: def.maxHealth,
            disposition: def.defaultDisposition,
            level,
          }
          const mesh = createAnimalMesh(def.kind)
          mesh.position.set(entity.position.x, entity.position.y, entity.position.z)
          scene.add(mesh)
          addEntity(entity, mesh)
          spawned = true
        }
      }
    }
  }

  const proceduralOrigins = getStructureOriginsInChunk(
    WORLD_SEED,
    chunkX,
    chunkZ,
    getHeight,
    getResolvedBiome,
  )
  const fixedVillageOrigins = getFixedVillageOriginsInChunk(
    getActivePois(),
    chunkX,
    chunkZ,
    getHeight,
    getResolvedBiome,
  )
  const origins = [...proceduralOrigins, ...fixedVillageOrigins]
  const villagerDef = ANIMAL_DEFS.find((d) => d.kind === 'villager')!
  for (const origin of origins) {
    if (origin.type !== 'village') continue
    if (origin.noAutoVillagers === true) continue
    const oxInChunk =
      origin.ox >= worldX && origin.ox < worldX + CHUNK_SIZE
    const ozInChunk =
      origin.oz >= worldZ && origin.oz < worldZ + CHUNK_SIZE
    if (!oxInChunk || !ozInChunk) continue
    let seed = 0
    for (let i = 0; i < chunkKey.length; i++)
      seed = (seed << 5) - seed + chunkKey.charCodeAt(i)
    seed += Math.floor(origin.ox) * 374761393 + Math.floor(origin.oz) * 668265263
    let rngState = (seed >>> 0) % 0x7fffffff || 1
    const villageRng = () => {
      rngState = Math.imul(rngState, 1103515245) + 12345
      return ((rngState >>> 0) % 0x7fffffff) / 0x7fffffff
    }
    const count =
      VILLAGERS_PER_VILLAGE_MIN +
      Math.floor(
        villageRng() * (VILLAGERS_PER_VILLAGE_MAX - VILLAGERS_PER_VILLAGE_MIN + 1),
      )
    for (let i = 0; i < count; i++) {
      const dx = (villageRng() * 2 - 1) * VILLAGE_SPAWN_OFFSET_RADIUS
      const dz = (villageRng() * 2 - 1) * VILLAGE_SPAWN_OFFSET_RADIUS
      const wx = origin.ox + dx
      const wz = origin.oz + dz
      const y = api.getColumnSurfaceY(wx, wz)
      const area = getAreaAt(wx, wz)
      const level = area ? getRandomMobLevelInArea(area) : undefined
      const entity: Omit<Entity, 'id'> = {
        kind: 'villager',
        position: { x: wx, y: y, z: wz },
        velocity: { x: 0, y: 0, z: 0 },
        rotationY: 0,
        aabb: { ...villagerDef.aabb },
        state: 'idle',
        stateTime: 0,
        health: villagerDef.maxHealth,
        maxHealth: villagerDef.maxHealth,
        disposition: villagerDef.defaultDisposition,
        level,
      }
      const mesh = createAnimalMesh('villager', villageRng())
      mesh.position.set(entity.position.x, entity.position.y, entity.position.z)
      scene.add(mesh)
      addEntity(entity, mesh)
    }
  }

  const fixedSpawns = getFixedSpawnsInChunk(
    getActivePois(),
    chunkKey,
    chunkX,
    chunkZ,
    getResolvedBiome,
    getHeight,
    WORLD_SEED,
  )
  for (let i = 0; i < fixedSpawns.length; i++) {
    const spawn = fixedSpawns[i]
    const def = getDef(spawn.kind)
    const y = api.getColumnSurfaceY(spawn.x, spawn.z)
    const area = getAreaAt(spawn.x, spawn.z)
    const level = area ? getRandomMobLevelInArea(area) : undefined
    const entity: Omit<Entity, 'id'> = {
      kind: spawn.kind,
      position: { x: spawn.x, y, z: spawn.z },
      velocity: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      aabb: { ...def.aabb },
      state: 'idle',
      stateTime: 0,
      health: def.maxHealth,
      maxHealth: def.maxHealth,
      disposition: def.defaultDisposition,
      level,
      ...(spawn.questOfferIds != null && spawn.questOfferIds.length > 0
        ? {
            questGiver: {
              offeredQuestIds: spawn.questOfferIds,
              ...(spawn.prerequisiteQuestIds != null && spawn.prerequisiteQuestIds.length > 0
                ? { prerequisiteQuestIds: spawn.prerequisiteQuestIds }
                : {}),
              ...(spawn.talkTargetId != null ? { talkTargetId: spawn.talkTargetId } : {}),
            },
          }
        : {}),
    }
    let variant: number | undefined
    if (spawn.kind === 'villager') {
      let seed = 0
      for (let j = 0; j < chunkKey.length; j++) seed = (seed << 5) - seed + chunkKey.charCodeAt(j)
      seed += Math.floor(spawn.x) * 374761393 + Math.floor(spawn.z) * 668265263 + i * 31
      const rng = makeChunkRng(String(seed), 'villager')
      variant = rng()
    }
    const mesh = createAnimalMesh(spawn.kind, variant)
    mesh.position.set(entity.position.x, entity.position.y, entity.position.z)
    if (entity.questGiver) {
      const iconSprite = createQuestNpcIcon(entity)
      mesh.add(iconSprite)
    }
    scene.add(mesh)
    const added = addEntity(entity, mesh)
    if (added.questGiver) {
      const iconSprite = mesh.children[mesh.children.length - 1]
      if (iconSprite instanceof THREE.Sprite) {
        registerQuestNpcSprite(added.id, iconSprite)
      }
    }
  }
}

/**
 * Despawn all entities in the given chunk (call before unloadChunk).
 * Removes from registry, removes and disposes mesh from scene.
 */
export function despawnEntitiesInChunk(scene: THREE.Scene, chunkKey: string): void {
  const entities = getEntitiesInChunk(chunkKey)
  for (const e of entities) {
    if (e.questGiver) unregisterAndDisposeQuestNpcSprite(e.id)
    const mesh = removeEntity(e.id)
    if (mesh) {
      scene.remove(mesh)
      mesh.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose()
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
          else obj.material?.dispose()
        }
      })
    }
  }
}

export { getDef }

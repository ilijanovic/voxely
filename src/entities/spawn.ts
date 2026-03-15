import * as THREE from 'three'
import type { AnimalKind, Entity } from './types'
import { getEntitiesInChunk } from './registry'
import { getWorldApi, type WorldApi } from '../world-api'
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
  CREATURE_SPAWN_SURFACE_BLOCKS,
  CREATURE_SPAWN_POSITION_ATTEMPTS,
  HOSTILE_SPAWN_MAX_LIGHT,
} from './spawn-constants'
import { isNight } from '../atmosphere'
import type { Biome } from '../types'
import {
  getCreatureDefsForBiome,
  getCreatureSpawnProbability,
  pickWeightedCreature,
} from './entity-defs'
import {
  makeNaturalSpawnRng,
  makeVillageSpawnRng,
  makeVillagerVariantRng,
  makeZoneChunkRng,
} from './spawn-rng'
import { removeEntityFromScene, spawnEntityInScene } from './spawn-scene'

/** Min and max number of villagers to spawn per village (deterministic per village origin). */
const VILLAGERS_PER_VILLAGE_MIN = 1
const VILLAGERS_PER_VILLAGE_MAX = 2
/** Max block offset in X/Z from village center for villager spawn position. */
const VILLAGE_SPAWN_OFFSET_RADIUS = 3

interface ChunkSpawnContext {
  scene: THREE.Scene
  chunkKey: string
  chunkX: number
  chunkZ: number
  worldX: number
  worldZ: number
  api: WorldApi
}

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
 * Builds the shared spawn context for one chunk.
 *
 * @param scene - Scene receiving spawned entities
 * @param chunkKey - Chunk key string
 * @param chunkX - Chunk x coordinate
 * @param chunkZ - Chunk z coordinate
 * @returns Stable chunk-scoped context for all spawn sources
 */
function createChunkSpawnContext(
  scene: THREE.Scene,
  chunkKey: string,
  chunkX: number,
  chunkZ: number,
): ChunkSpawnContext {
  return {
    scene,
    chunkKey,
    chunkX,
    chunkZ,
    worldX: chunkX * CHUNK_SIZE,
    worldZ: chunkZ * CHUNK_SIZE,
    api: getWorldApi(),
  }
}

/**
 * Spawns all creature-zone entities that overlap the chunk.
 *
 * @param ctx - Chunk-scoped spawn context
 * @returns Kinds that were already spawned by zone logic in this chunk
 */
function spawnZoneEntitiesInChunk(ctx: ChunkSpawnContext): Set<AnimalKind> {
  const kindsSpawnedByZones = getKindsSpawnedByZonesInChunk(ctx.chunkX, ctx.chunkZ)

  for (const zone of getZonesOverlappingChunk(ctx.chunkX, ctx.chunkZ)) {
    const rng = makeZoneChunkRng(ctx.chunkKey, zone.id)
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
          wx = ctx.worldX + 2 + rng() * (CHUNK_SIZE - 4)
          wz = ctx.worldZ + 2 + rng() * (CHUNK_SIZE - 4)
          const dx = wx - zone.centerX
          const dz = wz - zone.centerZ
          if (dx * dx + dz * dz <= zone.radius * zone.radius) break
        }
        const dx = wx - zone.centerX
        const dz = wz - zone.centerZ
        if (dx * dx + dz * dz > zone.radius * zone.radius) continue
      }
      if (zone.kind === 'sheep' && SHEEP_FORBIDDEN_BIOMES.has(ctx.api.getBiome(wx, wz))) continue
      const y = ctx.api.getColumnSurfaceY(wx, wz)
      const area = getAreaAt(wx, wz)
      const level = area ? getRandomMobLevelInArea(area) : undefined
      spawnEntityInScene({
        scene: ctx.scene,
        kind: zone.kind,
        position: { x: wx, y: y, z: wz },
        disposition: zone.dispositionOverride,
        level,
        spawnHome: { x: wx, z: wz },
        wanderRadius: zone.wanderRadius,
      })
    }
  }

  return kindsSpawnedByZones
}

/**
 * Spawns natural chunk-based creatures for the chunk.
 *
 * @param ctx - Chunk-scoped spawn context
 * @param blockedKinds - Creature kinds already claimed by zone spawning
 */
function spawnNaturalEntitiesInChunk(
  ctx: ChunkSpawnContext,
  blockedKinds: Set<AnimalKind>,
): void {
  const chunkBiome = getChunkRepresentativeBiome(
    ctx.chunkX,
    ctx.chunkZ,
    ctx.api.getBiome.bind(ctx.api),
  )
  const probability = getCreatureSpawnProbability(chunkBiome)
  const weightedDefs = getCreatureDefsForBiome(chunkBiome).filter(
    (entry) => !blockedKinds.has(entry.def.kind),
  )

  if (probability > 0 && weightedDefs.length > 0) {
    const rng = makeNaturalSpawnRng(ctx.chunkKey)
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
          const wx = ctx.worldX + 2 + rng() * (CHUNK_SIZE - 4)
          const wz = ctx.worldZ + 2 + rng() * (CHUNK_SIZE - 4)
          const posBiome = ctx.api.getBiome(wx, wz)
          if (!def.spawnBiomes.includes(posBiome)) continue
          const y = ctx.api.getColumnSurfaceY(wx, wz)
          if (def.defaultDisposition === 'aggro') {
            if (!isNight()) continue
            const light = ctx.api.getBlockLightAt?.(wx, y, wz) ?? 0
            if (light > HOSTILE_SPAWN_MAX_LIGHT) continue
          }
          const block = ctx.api.getBlockAt(wx, y, wz)
          if (block !== 'air' && block !== null && !CREATURE_SPAWN_SURFACE_BLOCKS.has(block)) continue
          const area = getAreaAt(wx, wz)
          const level = area ? getRandomMobLevelInArea(area) : undefined
          spawnEntityInScene({
            scene: ctx.scene,
            kind: def.kind,
            position: { x: wx, y: y, z: wz },
            disposition: def.defaultDisposition,
            level,
          })
          spawned = true
        }
      }
    }
  }
}

/**
 * Returns all village origins that can auto-spawn villagers in this chunk.
 *
 * @param ctx - Chunk-scoped spawn context
 * @returns Village origins affecting this chunk
 */
function getVillageOriginsInChunk(ctx: ChunkSpawnContext) {
  const proceduralOrigins = getStructureOriginsInChunk(
    WORLD_SEED,
    ctx.chunkX,
    ctx.chunkZ,
    getHeight,
    getResolvedBiome,
  )
  const fixedVillageOrigins = getFixedVillageOriginsInChunk(
    getActivePois(),
    ctx.chunkX,
    ctx.chunkZ,
    getHeight,
    getResolvedBiome,
  )
  return [...proceduralOrigins, ...fixedVillageOrigins]
}

/**
 * Spawns auto-generated villagers for villages whose origin lies in the chunk.
 *
 * @param ctx - Chunk-scoped spawn context
 */
function spawnVillageEntitiesInChunk(ctx: ChunkSpawnContext): void {
  for (const origin of getVillageOriginsInChunk(ctx)) {
    if (origin.type !== 'village') continue
    if (origin.noAutoVillagers === true) continue
    const oxInChunk = origin.ox >= ctx.worldX && origin.ox < ctx.worldX + CHUNK_SIZE
    const ozInChunk = origin.oz >= ctx.worldZ && origin.oz < ctx.worldZ + CHUNK_SIZE
    if (!oxInChunk || !ozInChunk) continue
    const villageRng = makeVillageSpawnRng(ctx.chunkKey, origin.ox, origin.oz)
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
      const y = ctx.api.getColumnSurfaceY(wx, wz)
      const area = getAreaAt(wx, wz)
      const level = area ? getRandomMobLevelInArea(area) : undefined
      spawnEntityInScene({
        scene: ctx.scene,
        kind: 'villager',
        position: { x: wx, y: y, z: wz },
        level,
        variant: villageRng(),
      })
    }
  }
}

/**
 * Builds quest-giver metadata for a fixed spawn when it offers quests or talk objectives.
 *
 * @param spawn - Fixed spawn definition
 * @returns Quest-giver payload or undefined
 */
function buildQuestGiverConfig(
  spawn: {
    questOfferIds?: string[]
    prerequisiteQuestIds?: string[]
    talkTargetId?: string
  },
): Entity['questGiver'] | undefined {
  if (spawn.questOfferIds == null || spawn.questOfferIds.length === 0) return undefined
  return {
    offeredQuestIds: spawn.questOfferIds,
    ...(spawn.prerequisiteQuestIds != null && spawn.prerequisiteQuestIds.length > 0
      ? { prerequisiteQuestIds: spawn.prerequisiteQuestIds }
      : {}),
    ...(spawn.talkTargetId != null ? { talkTargetId: spawn.talkTargetId } : {}),
  }
}

/**
 * Spawns fixed POI-authored entities for the chunk.
 *
 * @param ctx - Chunk-scoped spawn context
 */
function spawnFixedEntitiesInChunk(ctx: ChunkSpawnContext): void {
  const fixedSpawns = getFixedSpawnsInChunk(
    getActivePois(),
    ctx.chunkKey,
    ctx.chunkX,
    ctx.chunkZ,
    getResolvedBiome,
    getHeight,
    WORLD_SEED,
  )
  for (let i = 0; i < fixedSpawns.length; i++) {
    const spawn = fixedSpawns[i]
    const y = ctx.api.getColumnSurfaceY(spawn.x, spawn.z)
    const area = getAreaAt(spawn.x, spawn.z)
    const level = area ? getRandomMobLevelInArea(area) : undefined
    const variant =
      spawn.kind === 'villager'
        ? makeVillagerVariantRng(ctx.chunkKey, spawn.x, spawn.z, i)()
        : undefined
    spawnEntityInScene({
      scene: ctx.scene,
      kind: spawn.kind,
      position: { x: spawn.x, y, z: spawn.z },
      level,
      questGiver: buildQuestGiverConfig(spawn),
      variant,
    })
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
  const ctx = createChunkSpawnContext(scene, chunkKey, chunkX, chunkZ)
  const kindsSpawnedByZones = spawnZoneEntitiesInChunk(ctx)
  spawnNaturalEntitiesInChunk(ctx, kindsSpawnedByZones)
  spawnVillageEntitiesInChunk(ctx)
  spawnFixedEntitiesInChunk(ctx)
}

/**
 * Despawn all entities in the given chunk (call before unloadChunk).
 * Removes from registry, removes and disposes mesh from scene.
 */
export function despawnEntitiesInChunk(scene: THREE.Scene, chunkKey: string): void {
  const entities = getEntitiesInChunk(chunkKey)
  for (const entity of entities) {
    removeEntityFromScene(scene, entity)
  }
}

export { ANIMAL_DEFS, getDef } from './entity-defs'

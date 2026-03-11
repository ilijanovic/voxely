import * as THREE from 'three'
import type { Entity, AnimalKind, AnimalDef } from './types'
import { addEntity, removeEntity, getEntitiesInChunk } from './registry'
import { createAnimalMesh } from './meshes'
import { getWorldApi } from '../world-api'
import { CHUNK_SIZE } from '../constants'
import { getStructureOriginsInChunk } from '../terrain/structures/origins'
import { getHeight, getResolvedBiome, WORLD_SEED } from '../game-terrain'
import { getAreaAt, getRandomMobLevelInArea } from '../world-areas'
import {
  POI_REGISTRY,
  getFixedVillageOriginsInChunk,
  getFixedSpawnsInChunk,
} from '../world-pois'

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
]

function getDef(kind: AnimalKind): AnimalDef {
  const d = ANIMAL_DEFS.find((x) => x.kind === kind)
  if (!d) throw new Error('Unknown animal kind: ' + kind)
  return d
}

/**
 * Spawn entities for a newly loaded chunk. Deterministic per chunk + kind.
 * Uses world-api for getSurfaceY and getBiome.
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

  for (const def of ANIMAL_DEFS) {
    if (def.spawnBiomes.length === 0) continue
    const rng = makeChunkRng(chunkKey, def.kind)
    const count = Math.floor(rng() * (def.maxPerChunk + 1))
    for (let i = 0; i < count; i++) {
      const wx = worldX + 2 + rng() * (CHUNK_SIZE - 4)
      const wz = worldZ + 2 + rng() * (CHUNK_SIZE - 4)
      const biome = api.getBiome(wx, wz)
      if (!def.spawnBiomes.includes(biome)) continue
      const y = api.getColumnSurfaceY(wx, wz)
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
    POI_REGISTRY,
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
    POI_REGISTRY,
    chunkKey,
    chunkX,
    chunkZ,
    getResolvedBiome,
    getHeight,
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
    scene.add(mesh)
    addEntity(entity, mesh)
  }
}

/**
 * Despawn all entities in the given chunk (call before unloadChunk).
 * Removes from registry, removes and disposes mesh from scene.
 */
export function despawnEntitiesInChunk(scene: THREE.Scene, chunkKey: string): void {
  const entities = getEntitiesInChunk(chunkKey)
  for (const e of entities) {
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

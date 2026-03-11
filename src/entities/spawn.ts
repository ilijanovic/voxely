import * as THREE from 'three'
import type { Entity, AnimalKind, AnimalDef } from './types'
import { addEntity, removeEntity, getEntitiesInChunk } from './registry'
import { createAnimalMesh } from './meshes'
import { getWorldApi } from '../world-api'
import { CHUNK_SIZE } from '../constants'

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
    spawnBiomes: ['plains', 'forest', 'jungle', 'meadow'],
    maxPerChunk: 1,
  },
  {
    kind: 'pig',
    aabb: { halfX: 0.3, halfZ: 0.2, height: 0.5 },
    walkSpeed: 1.4,
    runSpeed: 2.6,
    spawnBiomes: ['plains', 'forest', 'jungle', 'meadow'],
    maxPerChunk: 1,
  },
  {
    kind: 'wolf',
    aabb: { halfX: 0.35, halfZ: 0.25, height: 0.55 },
    walkSpeed: 1.6,
    runSpeed: 3.2,
    spawnBiomes: ['forest', 'jungle', 'mountain', 'snow', 'grove'],
    maxPerChunk: 1,
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
    const rng = makeChunkRng(chunkKey, def.kind)
    const count = Math.floor(rng() * (def.maxPerChunk + 1))
    for (let i = 0; i < count; i++) {
      const wx = worldX + 2 + rng() * (CHUNK_SIZE - 4)
      const wz = worldZ + 2 + rng() * (CHUNK_SIZE - 4)
      const biome = api.getBiome(wx, wz)
      if (!def.spawnBiomes.includes(biome)) continue
      const y = api.getColumnSurfaceY(wx, wz)
      const entity: Omit<Entity, 'id'> = {
        kind: def.kind,
        position: { x: wx, y: y, z: wz },
        velocity: { x: 0, y: 0, z: 0 },
        rotationY: 0,
        aabb: { ...def.aabb },
        state: 'idle',
        stateTime: 0,
      }
      const mesh = createAnimalMesh(def.kind)
      mesh.position.set(entity.position.x, entity.position.y, entity.position.z)
      scene.add(mesh)
      addEntity(entity, mesh)
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

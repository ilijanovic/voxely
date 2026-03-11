import type * as THREE from 'three'
import type { Entity } from './types'
import { CHUNK_SIZE } from '../constants'

const entities = new Map<string, Entity>()
/** Cached list for getAllEntities(); updated on add/remove to avoid per-frame Array.from. */
const entitiesList: Entity[] = []
const entityMeshes = new Map<string, THREE.Group>()

let nextId = 0

function generateId(): string {
  return 'e_' + (nextId++).toString(36)
}

/** Add entity and optionally its mesh. Returns the entity (with id set if not provided). */
export function addEntity(
  entity: Omit<Entity, 'id'> & { id?: string },
  mesh?: THREE.Group,
): Entity {
  const id = entity.id ?? generateId()
  const e: Entity = { ...entity, id }
  entities.set(id, e)
  entitiesList.push(e)
  if (mesh) entityMeshes.set(id, mesh)
  return e
}

/** Remove entity by id; returns the mesh if any (caller disposes and removes from scene). */
export function removeEntity(id: string): THREE.Group | undefined {
  const mesh = entityMeshes.get(id)
  entities.delete(id)
  const idx = entitiesList.findIndex((x) => x.id === id)
  if (idx !== -1) entitiesList.splice(idx, 1)
  entityMeshes.delete(id)
  return mesh
}

/** Returns the entity by id, or undefined if not found. */
export function getEntity(id: string): Entity | undefined {
  return entities.get(id)
}

/** Returns the mesh group for an entity, or undefined if not set or cleared. */
export function getEntityMesh(id: string): THREE.Group | undefined {
  return entityMeshes.get(id)
}

/** Get all entities (same array reference each time; do not mutate). */
export function getAllEntities(): Entity[] {
  return entitiesList
}

/** Chunk key for position (same convention as game). */
export function entityChunkKey(entity: Entity): string {
  const cx = Math.floor(entity.position.x / CHUNK_SIZE)
  const cz = Math.floor(entity.position.z / CHUNK_SIZE)
  return `${cx},${cz}`
}

/** All entities whose chunk position equals the given chunk key. */
export function getEntitiesInChunk(chunkKey: string): Entity[] {
  return getAllEntities().filter((e) => entityChunkKey(e) === chunkKey)
}

/** Entities within radius (squared distance) of (x, z). */
export function getEntitiesInRadius(x: number, z: number, radiusSq: number): Entity[] {
  return getAllEntities().filter((e) => {
    const dx = e.position.x - x
    const dz = e.position.z - z
    return dx * dx + dz * dz <= radiusSq
  })
}

/** Remove mesh reference when disposing (e.g. after removing from scene). */
export function clearEntityMesh(id: string): void {
  entityMeshes.delete(id)
}

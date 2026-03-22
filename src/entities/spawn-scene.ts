import * as THREE from 'three'
import type { Entity, AnimalKind, MobDisposition } from './types'
import { addEntity, removeEntity as removeEntityFromRegistry, clearEntityMesh } from './registry'
import { createAnimalMesh } from './meshes'
import { getDef } from './entity-defs'

export interface SpawnEntityInSceneArgs {
  scene: THREE.Scene
  kind: AnimalKind
  position: { x: number; y: number; z: number }
  disposition?: MobDisposition
  level?: number
  questGiver?: Entity['questGiver']
  variant?: number
  spawnHome?: { x: number; z: number }
  wanderRadius?: number
}

/**
 * Spawns an entity: creates its data record, creates a mesh, adds both to registries/scene.
 *
 * @param args - Spawn config
 * @returns Spawned entity
 */
export function spawnEntityInScene(args: SpawnEntityInSceneArgs): Entity {
  const { scene, kind, position, disposition, level, questGiver, variant, spawnHome, wanderRadius } = args
  const def = getDef(kind)
  const mesh = createAnimalMesh(kind, variant)
  mesh.position.set(position.x, position.y, position.z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  scene.add(mesh)

  const entity = addEntity(
    {
      kind,
      position: { ...position },
      velocity: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      aabb: def.aabb,
      state: 'idle',
      stateTime: 0,
      health: def.maxHealth,
      maxHealth: def.maxHealth,
      disposition: disposition ?? def.defaultDisposition,
      level,
      questGiver,
      spawnHome,
      wanderRadius,
    },
    mesh,
  )
  return entity
}

/**
 * Removes an entity from the scene and entity registry.
 *
 * @param scene - Scene containing the mesh
 * @param entity - Entity to remove
 */
export function removeEntityFromScene(scene: THREE.Scene, entity: Entity): void {
  const mesh = removeEntityFromRegistry(entity.id)
  if (!mesh) return
  scene.remove(mesh)
  mesh.traverse((obj) => {
    const m = obj as THREE.Mesh
    const geo = (m as THREE.Mesh).geometry
    if (geo) geo.dispose?.()
    const mat = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose?.())
    else mat?.dispose?.()
  })
  clearEntityMesh(entity.id)
}


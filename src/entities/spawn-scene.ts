import * as THREE from 'three'
import { addEntity, removeEntity } from './registry'
import { createAnimalMesh } from './meshes'
import {
  createQuestNpcIcon,
  registerQuestNpcSprite,
  unregisterAndDisposeQuestNpcSprite,
} from './quest-npc-icon'
import type { AnimalKind, Entity, MobDisposition } from './types'
import { getDef } from './entity-defs'

export interface SpawnEntityInSceneParams {
  scene: THREE.Scene
  kind: AnimalKind
  position: { x: number; y: number; z: number }
  disposition?: MobDisposition
  level?: number
  spawnHome?: { x: number; z: number }
  wanderRadius?: number
  questGiver?: Entity['questGiver']
  variant?: number
}

/**
 * Creates an entity, adds its mesh to the scene, and registers quest-giver UI when needed.
 *
 * @param params - Spawn details for the entity instance
 * @returns The registered entity including its generated id
 */
export function spawnEntityInScene(params: SpawnEntityInSceneParams): Entity {
  const def = getDef(params.kind)
  const entity: Omit<Entity, 'id'> = {
    kind: params.kind,
    position: { ...params.position },
    velocity: { x: 0, y: 0, z: 0 },
    rotationY: 0,
    aabb: { ...def.aabb },
    state: 'idle',
    stateTime: 0,
    health: def.maxHealth,
    maxHealth: def.maxHealth,
    disposition: params.disposition ?? def.defaultDisposition,
    level: params.level,
    ...(params.spawnHome ? { spawnHome: params.spawnHome } : {}),
    ...(params.wanderRadius != null ? { wanderRadius: params.wanderRadius } : {}),
    ...(params.questGiver ? { questGiver: params.questGiver } : {}),
  }

  const mesh = createAnimalMesh(params.kind, params.variant)
  mesh.position.set(entity.position.x, entity.position.y, entity.position.z)
  if (entity.questGiver) {
    const iconSprite = createQuestNpcIcon(entity)
    mesh.add(iconSprite)
  }

  params.scene.add(mesh)
  const added = addEntity(entity, mesh)
  if (added.questGiver) {
    const iconSprite = mesh.children[mesh.children.length - 1]
    if (iconSprite instanceof THREE.Sprite) {
      registerQuestNpcSprite(added.id, iconSprite)
    }
  }

  return added
}

/**
 * Removes one registered entity from the scene and disposes any owned mesh resources.
 *
 * @param scene - Scene containing the entity mesh
 * @param entity - Entity identity and quest-giver metadata
 */
export function removeEntityFromScene(
  scene: THREE.Scene,
  entity: Pick<Entity, 'id' | 'questGiver'>,
): void {
  if (entity.questGiver) unregisterAndDisposeQuestNpcSprite(entity.id)

  const mesh = removeEntity(entity.id)
  if (!mesh) return

  scene.remove(mesh)
  mesh.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose()
      if (Array.isArray(obj.material)) obj.material.forEach((material) => material.dispose())
      else obj.material?.dispose()
    }
  })
}

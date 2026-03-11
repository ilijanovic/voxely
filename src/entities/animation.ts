import { getAllEntities, getEntityMesh } from './registry'

const BOB_FREQ = 8
const BOB_AMPLITUDE = 0.02
const BOB_AMPLITUDE_WALK = 0.04

/**
 * Sync entity meshes to entity position/rotation and apply simple bobbing.
 * Call after movement each frame. time is total elapsed seconds (e.g. from game loop).
 */
export function updateAnimation(time: number): void {
  const entities = getAllEntities()
  for (const e of entities) {
    const mesh = getEntityMesh(e.id)
    if (!mesh) continue
    mesh.position.set(e.position.x, e.position.y, e.position.z)
    mesh.rotation.y = e.rotationY
    const moving =
      e.state === 'wander' || e.state === 'walk' || e.state === 'flee' || e.state === 'chase'
    const amp = moving ? BOB_AMPLITUDE_WALK : BOB_AMPLITUDE
    mesh.position.y += Math.sin(time * BOB_FREQ) * amp
  }
}

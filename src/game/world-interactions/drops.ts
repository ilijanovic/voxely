/**
 * Drop items: spawn after block break, bob and rotate in place, pickup when player is within radius (adds to hotbar and removes from scene).
 */
import * as THREE from 'three'
import type { BlockType } from '../../types'
import { getMaterialForBlockType } from '../../block-materials'
import { addBlockToInventory } from '../../game-hotbar'

export type Drop = {
  position: THREE.Vector3
  blockType: BlockType
  group: THREE.Group
  bobPhase: number
}

export type DropsConfig = {
  pickupRadius: number
  bobSpeed: number
  bobHeight: number
}

/** Returns the material used for a drop mesh (block-type-specific; torch/bedrock use fallbacks). */
export function getMaterialForDrop(blockType: BlockType): THREE.Material {
  if (blockType === 'torch') {
    const w = getMaterialForBlockType('wood')
    return Array.isArray(w) ? w[2] : w
  }
  if (blockType === 'bedrock') {
    const b = getMaterialForBlockType('bedrock')
    return Array.isArray(b) ? b[0] : b
  }
  const m = getMaterialForBlockType(blockType)
  return Array.isArray(m)
    ? (m as THREE.MeshStandardMaterial[])[2]
    : (m as THREE.MeshStandardMaterial)
}

/** Creates a drop mesh at world position, adds it to the scene and to the drops array for updateDropsAndPickup. */
export function spawnDrop(params: {
  scene: THREE.Scene
  drops: Drop[]
  worldX: number
  worldY: number
  worldZ: number
  blockType: BlockType
}): void {
  const size = 0.35
  const geo = new THREE.BoxGeometry(size, size, size)
  const mat = getMaterialForDrop(params.blockType)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  const group = new THREE.Group()
  group.add(mesh)
  group.position.set(params.worldX, params.worldY, params.worldZ)
  params.scene.add(group)
  params.drops.push({
    position: new THREE.Vector3(params.worldX, params.worldY, params.worldZ),
    blockType: params.blockType,
    group,
    bobPhase: Math.random() * Math.PI * 2,
  })
}

/** Updates drop bobbing/rotation and removes drops picked up within config.pickupRadius (adds block to hotbar, disposes mesh). */
export function updateDropsAndPickup(params: {
  scene: THREE.Scene
  drops: Drop[]
  playerX: number
  playerY: number
  playerZ: number
  time: number
  config: DropsConfig
}): void {
  const { pickupRadius, bobSpeed, bobHeight } = params.config
  for (let i = params.drops.length - 1; i >= 0; i--) {
    const d = params.drops[i]
    const bob = Math.max(0, Math.sin(params.time * bobSpeed + d.bobPhase)) * bobHeight
    d.group.position.y = d.position.y + bob
    d.group.rotation.y = params.time * 0.8 + d.bobPhase * 0.5
    const dx = d.position.x - params.playerX
    const dy = d.position.y - params.playerY
    const dz = d.position.z - params.playerZ
    const distSq = dx * dx + dy * dy + dz * dz
    if (distSq < pickupRadius * pickupRadius) {
      addBlockToInventory(d.blockType)
      params.scene.remove(d.group)
      d.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry) obj.geometry.dispose()
      })
      params.drops.splice(i, 1)
    }
  }
}

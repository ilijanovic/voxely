/**
 * Drop items: spawn after block break, land with a short fall animation, bob and rotate in place, move toward player when in magnet radius, pickup when within pickup radius.
 */
import * as THREE from '@/three'
import type { BlockType } from '../../types'
import { getMaterialForBlockType } from '../../block-materials'
import { addBlockToInventory } from '../../game-hotbar'

/** Duration in seconds for the drop to fall from spawn height to rest position. */
export const DROP_LAND_DURATION = 0.25
/** Default magnet radius in world units (beyond this, drop does not move toward player). */
export const DEFAULT_MAGNET_RADIUS = 2.5
/** Speed at which a drop moves toward the player when in magnet radius (units per second). */
export const DEFAULT_MAGNET_SPEED = 6

/** Common fields for all drop types. */
interface DropBase {
  restPosition: THREE.Vector3
  group: THREE.Group
  bobPhase: number
  spawnTime: number
  initialY: number
}

/** Item drop (block break, loot). */
export interface ItemDrop extends DropBase {
  type: 'item'
  blockType: BlockType
}

/** XP orb (mob kill); collected for experience. */
export interface XpDrop extends DropBase {
  type: 'xp'
  xpAmount: number
}

export type Drop = ItemDrop | XpDrop

export type DropsConfig = {
  pickupRadius: number
  bobSpeed: number
  bobHeight: number
  magnetRadius: number
  magnetSpeed: number
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

/**
 * Creates a drop mesh: spawns at (worldX, startY, worldZ) and animates down to restY over DROP_LAND_DURATION.
 * Adds to the scene and drops array for updateDropsAndPickup.
 */
export function spawnDrop(params: {
  scene: THREE.Scene
  drops: Drop[]
  worldX: number
  worldZ: number
  startY: number
  restY: number
  blockType: BlockType
  time: number
}): void {
  const size = 0.35
  const geo = new THREE.BoxGeometry(size, size, size)
  const mat = getMaterialForDrop(params.blockType)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  const group = new THREE.Group()
  group.add(mesh)
  group.position.set(params.worldX, params.startY, params.worldZ)
  params.scene.add(group)
  const restPosition = new THREE.Vector3(params.worldX, params.restY, params.worldZ)
  params.drops.push({
    type: 'item',
    restPosition,
    blockType: params.blockType,
    group,
    bobPhase: Math.random() * Math.PI * 2,
    spawnTime: params.time,
    initialY: params.startY,
  })
}

/** Size of the XP orb mesh. */
const XP_ORB_SIZE = 0.3

/**
 * Spawns a collectible XP orb at the given position. Uses same landing/magnet/pickup as item drops.
 */
export function spawnXpDrop(params: {
  scene: THREE.Scene
  drops: Drop[]
  worldX: number
  worldZ: number
  startY: number
  restY: number
  amount: number
  time: number
}): void {
  const geo = new THREE.SphereGeometry(XP_ORB_SIZE * 0.5, 10, 8)
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: 0.95,
  })
  const mesh = new THREE.Mesh(geo, mat)
  const group = new THREE.Group()
  group.add(mesh)
  group.position.set(params.worldX, params.startY, params.worldZ)
  params.scene.add(group)
  const restPosition = new THREE.Vector3(params.worldX, params.restY, params.worldZ)
  params.drops.push({
    type: 'xp',
    restPosition,
    xpAmount: params.amount,
    group,
    bobPhase: Math.random() * Math.PI * 2,
    spawnTime: params.time,
    initialY: params.startY,
  })
}

/**
 * Updates drop landing animation, bobbing/rotation, magnet pull toward player, and pickup when within config.pickupRadius.
 */
export function updateDropsAndPickup(params: {
  scene: THREE.Scene
  drops: Drop[]
  playerX: number
  playerY: number
  playerZ: number
  time: number
  dt: number
  config: DropsConfig
  /** Called when the player picks up an XP orb; caller applies experience. */
  onXpPickup?: (amount: number) => void
}): void {
  const { pickupRadius, bobSpeed, bobHeight, magnetRadius, magnetSpeed } = params.config
  const playerPos = new THREE.Vector3(params.playerX, params.playerY, params.playerZ)
  for (let i = params.drops.length - 1; i >= 0; i--) {
    const d = params.drops[i]
    const inLanding =
      d.spawnTime > 0 && params.time - d.spawnTime < DROP_LAND_DURATION
    if (inLanding) {
      const elapsed = params.time - d.spawnTime
      const t = Math.min(1, elapsed / DROP_LAND_DURATION)
      const easeOut = 1 - (1 - t) * (1 - t)
      d.group.position.x = d.restPosition.x
      d.group.position.y = d.initialY + (d.restPosition.y - d.initialY) * easeOut
      d.group.position.z = d.restPosition.z
      if (t >= 1) d.spawnTime = 0
    } else {
      if (d.spawnTime > 0) d.spawnTime = 0
      const dx = d.restPosition.x - params.playerX
      const dy = d.restPosition.y - params.playerY
      const dz = d.restPosition.z - params.playerZ
      const distSq = dx * dx + dy * dy + dz * dz
      const dist = Math.sqrt(distSq)
      if (dist < pickupRadius) {
        if (d.type === 'item') {
          addBlockToInventory(d.blockType)
        } else {
          params.onXpPickup?.(d.xpAmount)
        }
        params.scene.remove(d.group)
        d.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.geometry) obj.geometry.dispose()
        })
        params.drops.splice(i, 1)
        continue
      }
      if (dist < magnetRadius && dist > 0) {
        const move = magnetSpeed * params.dt
        if (move >= dist) {
          d.restPosition.copy(playerPos)
        } else {
          d.restPosition.x -= (dx / dist) * move
          d.restPosition.y -= (dy / dist) * move
          d.restPosition.z -= (dz / dist) * move
        }
      }
      const bob = Math.max(0, Math.sin(params.time * bobSpeed + d.bobPhase)) * bobHeight
      d.group.position.x = d.restPosition.x
      d.group.position.y = d.restPosition.y + bob
      d.group.position.z = d.restPosition.z
    }
    d.group.rotation.y = params.time * 0.8 + d.bobPhase * 0.5
  }
}

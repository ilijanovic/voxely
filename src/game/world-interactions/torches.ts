/**
 * Torch placement: mesh + point light, optional shadow; stored in torchContainer and placedTorches for save/load and shadow settings.
 */
import * as THREE from 'three'
import {
  TORCH_LIGHT_DECAY,
  TORCH_LIGHT_DISTANCE,
  TORCH_LIGHT_INTENSITY,
} from '../../constants'
import { getShadowsEnabled, getTorchShadowsEnabled } from '../../graphics-settings'

/** Face normal for torch attachment (e.g. floor +Y, wall +X). Used for position and rotation. */
export type FaceNormal = { x: number; y: number; z: number }

/** Default: torch standing on floor (stick points up). */
export const TORCH_FLOOR_NORMAL: FaceNormal = { x: 0, y: 1, z: 0 }

export type PlacedTorch = {
  x: number
  y: number
  z: number
  group: THREE.Group
  /** Attachment face normal; omitted in legacy saves (treated as floor). */
  nx?: number
  ny?: number
  nz?: number
}

/**
 * Creates a torch group (stick, flame, point light) at the attachment face; stick aligns with the face normal.
 * @param cellCenterX - Center of the block cell (e.g. bx + 0.5)
 * @param cellCenterY - Center of the block cell
 * @param cellCenterZ - Center of the block cell
 * @param faceNormal - Normal of the face the torch is attached to (default: floor, +Y)
 */
export function createTorchGroup(
  cellCenterX: number,
  cellCenterY: number,
  cellCenterZ: number,
  faceNormal: FaceNormal = TORCH_FLOOR_NORMAL,
): THREE.Group {
  const nx = faceNormal.x
  const ny = faceNormal.y
  const nz = faceNormal.z
  const group = new THREE.Group()
  group.position.set(
    cellCenterX - nx * 0.5,
    cellCenterY - ny * 0.5,
    cellCenterZ - nz * 0.5,
  )
  const normalVec = new THREE.Vector3(nx, ny, nz)
  const up = new THREE.Vector3(0, 1, 0)
  if (normalVec.lengthSq() > 1e-6) {
    normalVec.normalize()
    // Lean stick 45° from vertical toward the face (blend up + normal); floor stays up, ceiling stays down.
    const blended = new THREE.Vector3(0, 1, 0).add(normalVec)
    const stickDirection =
      blended.lengthSq() > 1e-6 ? blended.normalize().clone() : normalVec.clone()
    group.quaternion.setFromUnitVectors(up, stickDirection)
  }

  const stickMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 1 })
  const stickGeo = new THREE.BoxGeometry(0.12, 0.4, 0.12)
  const stick = new THREE.Mesh(stickGeo, stickMat)
  stick.position.y = 0.2
  stick.castShadow = true
  stick.receiveShadow = true
  group.add(stick)

  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6600 })
  const flameGeo = new THREE.BoxGeometry(0.2, 0.25, 0.2)
  const flame = new THREE.Mesh(flameGeo, flameMat)
  flame.position.y = 0.525
  group.add(flame)

  const light = new THREE.PointLight(
    0xffaa44,
    TORCH_LIGHT_INTENSITY,
    TORCH_LIGHT_DISTANCE,
    TORCH_LIGHT_DECAY,
  )
  light.position.y = 0.5
  applyTorchShadowSetting(light)
  group.add(light)

  return group
}

/** Applies current shadow settings to a torch point light (castShadow, map size, camera near/far, bias). */
export function applyTorchShadowSetting(light: THREE.PointLight): void {
  const enabled = getShadowsEnabled() && getTorchShadowsEnabled()
  light.castShadow = enabled
  if (enabled) {
    light.shadow.mapSize.width = 256
    light.shadow.mapSize.height = 256
    light.shadow.camera.near = 0.5
    light.shadow.camera.far = TORCH_LIGHT_DISTANCE + 4
    light.shadow.bias = -0.0001
  }
}

/** Places a torch at the given cell with the given face normal if not already placed; adds group to torchContainer and appends to placedTorches. Returns true if placed. */
export function placeTorch(params: {
  worldX: number
  worldY: number
  worldZ: number
  faceNormal?: FaceNormal
  torchContainer: THREE.Group | undefined
  placedTorches: PlacedTorch[]
  blockKeyNumeric: (x: number, y: number, z: number) => number
}): boolean {
  const keyNum = params.blockKeyNumeric(params.worldX, params.worldY, params.worldZ)
  if (params.placedTorches.some((t) => params.blockKeyNumeric(t.x, t.y, t.z) === keyNum)) {
    return false
  }
  const normal = params.faceNormal ?? TORCH_FLOOR_NORMAL
  const group = createTorchGroup(params.worldX, params.worldY, params.worldZ, normal)
  if (typeof params.torchContainer !== 'undefined') {
    params.torchContainer.add(group)
    params.placedTorches.push({
      x: params.worldX,
      y: params.worldY,
      z: params.worldZ,
      nx: normal.x,
      ny: normal.y,
      nz: normal.z,
      group,
    })
    return true
  }
  return false
}

/**
 * Removes the torch at the given block cell if present (from placedTorches and scene).
 * @returns true if a torch was removed
 */
export function removeTorchAt(params: {
  bx: number
  by: number
  bz: number
  torchContainer: THREE.Group | undefined
  placedTorches: PlacedTorch[]
  blockKeyNumeric: (x: number, y: number, z: number) => number
}): boolean {
  const keyNum = params.blockKeyNumeric(params.bx, params.by, params.bz)
  const idx = params.placedTorches.findIndex(
    (t) => params.blockKeyNumeric(t.x, t.y, t.z) === keyNum,
  )
  if (idx < 0) return false
  const t = params.placedTorches[idx]
  params.placedTorches.splice(idx, 1)
  if (typeof params.torchContainer !== 'undefined') params.torchContainer.remove(t.group)
  return true
}

/** Applies current torch shadow setting to all placed torch lights (e.g. after options change). */
export function applyTorchShadowSettingsToPlacedTorches(placedTorches: PlacedTorch[]): void {
  for (const t of placedTorches) {
    const child = t.group.children[2]
    if (child instanceof THREE.PointLight) applyTorchShadowSetting(child)
  }
}

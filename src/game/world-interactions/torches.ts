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
import { getBlockDefinition } from '../../block-registry'

/** Face normal for torch attachment (e.g. floor +Y, wall +X). Used for position and rotation. */
export type FaceNormal = { x: number; y: number; z: number }

/** Default: torch standing on floor (stick points up). */
export const TORCH_FLOOR_NORMAL: FaceNormal = { x: 0, y: 1, z: 0 }

/**
 * Returns true if the block type is any wall torch variant.
 * Wall torch variants encode their facing as a suffix (north/east/south/west).
 */
export function isWallTorchBlockType(blockType: string): boolean {
  return /^wall_torch_(north|east|south|west)$/.test(blockType)
}

/**
 * Returns the attachment face normal for a torch-like block type.
 * For floor torch this is +Y; for wall torch variants this is the wall normal.
 * @throws if blockType is not a torch block type.
 */
export function getTorchAttachmentNormalFromBlockType(blockType: string): FaceNormal {
  if (blockType === 'torch') return TORCH_FLOOR_NORMAL
  if (blockType === 'wall_torch_east') return { x: 1, y: 0, z: 0 }
  if (blockType === 'wall_torch_west') return { x: -1, y: 0, z: 0 }
  if (blockType === 'wall_torch_south') return { x: 0, y: 0, z: 1 }
  if (blockType === 'wall_torch_north') return { x: 0, y: 0, z: -1 }
  throw new Error(`Unknown torch block type: ${blockType}`)
}

export type PlacedTorch = {
  /** Torch block coordinates (integer). */
  bx: number
  by: number
  bz: number
  group: THREE.Group
  /** Attachment face normal; omitted in legacy saves (treated as floor). */
  nx?: number
  ny?: number
  nz?: number
  /** Owning chunk key (cx/cz packed) used to remove torches on chunk unload/refresh. */
  chunkKeyNum: number
}

/** Torch tilt away from wall, in degrees (Vanilla-like lean, not a full 45°). */
const WALL_TORCH_TILT_DEG = 22.5
/** How far to offset wall torch from block center towards the wall. */
const WALL_TORCH_WALL_OFFSET = 0.27
/** Vertical offset of a wall torch relative to block center (Vanilla wall torches sit slightly lower). */
const WALL_TORCH_Y_OFFSET = -0.1
/** Torch flame local Y position above stick. */
const TORCH_FLAME_Y = 0.52
/** Torch light local Y position (near flame). */
const TORCH_LIGHT_Y = 0.5

/**
 * Quantizes an arbitrary direction to one of the 6 axis-aligned normals.
 * Used to convert raycast normals into torch attachment normals.
 */
export function quantizeAxisNormal(n: FaceNormal): FaceNormal {
  const ax = Math.abs(n.x)
  const ay = Math.abs(n.y)
  const az = Math.abs(n.z)
  if (ay >= ax && ay >= az) return { x: 0, y: n.y >= 0 ? 1 : -1, z: 0 }
  if (ax >= az) return { x: n.x >= 0 ? 1 : -1, y: 0, z: 0 }
  return { x: 0, y: 0, z: n.z >= 0 ? 1 : -1 }
}

/**
 * Returns true if the block type can support a torch on the given attachment face.
 * This is a simplified "sturdy face" check: solid blocks are treated as sturdy.
 */
export function canSupportTorch(blockType: string | 'air' | null, faceNormal: FaceNormal): boolean {
  if (blockType === null || blockType === 'air') return false
  // Vanilla: torches do not attach to ceilings.
  if (faceNormal.y < 0) return false
  const def = getBlockDefinition(blockType)
  if (!def || def.solid !== true) return false
  // Top face: any solid block can support a torch on top.
  if (faceNormal.y > 0) return true
  // Side faces: only non-transparent solids act as sturdy walls (no torches on glass/ice sides).
  if (faceNormal.y === 0) {
    if (def.transparent === true) return false
    return true
  }
  return false
}

/**
 * Resolves the torch attachment normal for a torch placed into (bx,by,bz).
 * Prefers floor support, otherwise attaches to any sturdy side neighbor.
 */
export function resolveTorchAttachmentNormal(
  bx: number,
  by: number,
  bz: number,
  getBlockAt: (x: number, y: number, z: number) => string | 'air' | null,
  preferred?: FaceNormal,
): FaceNormal | null {
  const candidates: FaceNormal[] = []
  if (preferred) candidates.push(quantizeAxisNormal(preferred))
  // Prefer floor in absence of a strong preference (Vanilla default).
  candidates.push(TORCH_FLOOR_NORMAL)
  candidates.push({ x: 1, y: 0, z: 0 })
  candidates.push({ x: -1, y: 0, z: 0 })
  candidates.push({ x: 0, y: 0, z: 1 })
  candidates.push({ x: 0, y: 0, z: -1 })

  for (const n of candidates) {
    // No ceiling torches.
    if (n.y < 0) continue
    const sx = bx - n.x
    const sy = by - n.y
    const sz = bz - n.z
    const support = getBlockAt(sx, sy, sz)
    if (canSupportTorch(support, n)) return n
  }
  return null
}

/**
 * Creates a torch group (stick, flame, point light) at the attachment face; stick aligns with the face normal.
 * @param bx - Torch block X coordinate (integer)
 * @param by - Torch block Y coordinate (integer)
 * @param bz - Torch block Z coordinate (integer)
 * @param faceNormal - Normal of the face the torch is attached to (default: floor, +Y)
 */
export function createTorchGroup(
  bx: number,
  by: number,
  bz: number,
  faceNormal: FaceNormal = TORCH_FLOOR_NORMAL,
): THREE.Group {
  const nx = faceNormal.x
  const ny = faceNormal.y
  const nz = faceNormal.z
  const group = new THREE.Group()
  const cellCenterX = bx + 0.5
  const cellCenterY = by + 0.5
  const cellCenterZ = bz + 0.5

  if (ny === 1) {
    // Floor torch: base sits on the block below (at y = by).
    group.position.set(cellCenterX, by, cellCenterZ)
  } else {
    // Wall torch: attach to side face, slightly inset and slightly lower (Vanilla-like).
    group.position.set(
      cellCenterX - nx * (0.5 - WALL_TORCH_WALL_OFFSET),
      cellCenterY + WALL_TORCH_Y_OFFSET,
      cellCenterZ - nz * (0.5 - WALL_TORCH_WALL_OFFSET),
    )
    const axis = new THREE.Vector3(nz, 0, -nx) // rotate around axis perpendicular to wall normal
    if (axis.lengthSq() > 1e-6) {
      axis.normalize()
      group.quaternion.setFromAxisAngle(axis, THREE.MathUtils.degToRad(WALL_TORCH_TILT_DEG))
    }
  }

  const stickMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 1 })
  const stickGeo = new THREE.BoxGeometry(0.12, 0.4, 0.12)
  const stick = new THREE.Mesh(stickGeo, stickMat)
  stick.position.y = 0.2
  stick.castShadow = true
  stick.receiveShadow = true
  group.add(stick)

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xffaa33,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  })
  const flameGeo = new THREE.PlaneGeometry(0.28, 0.38)
  const flame = new THREE.Mesh(flameGeo, flameMat)
  flame.position.y = TORCH_FLAME_Y
  flame.rotation.y = Math.PI / 4
  // Second crossed quad for a Vanilla-like billboard flame.
  const flame2 = flame.clone()
  flame2.rotation.y = -Math.PI / 4
  group.add(flame)
  group.add(flame2)

  const light = new THREE.PointLight(
    0xffaa44,
    TORCH_LIGHT_INTENSITY,
    TORCH_LIGHT_DISTANCE,
    TORCH_LIGHT_DECAY,
  )
  light.position.y = TORCH_LIGHT_Y
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
  bx: number
  by: number
  bz: number
  /** The actual voxel block type (torch vs wall_torch_*). */
  blockType: 'torch' | `wall_torch_${'north' | 'east' | 'south' | 'west'}`
  preferredNormal?: FaceNormal
  chunkKeyNum: number
  torchContainer: THREE.Group | undefined
  placedTorches: PlacedTorch[]
  getBlockAt: (x: number, y: number, z: number) => string | 'air' | null
}): boolean {
  const { bx, by, bz } = params
  if (params.placedTorches.some((t) => t.bx === bx && t.by === by && t.bz === bz)) {
    return false
  }
  const normal =
    params.blockType === 'torch'
      ? resolveTorchAttachmentNormal(bx, by, bz, params.getBlockAt, params.preferredNormal)
      : getTorchAttachmentNormalFromBlockType(params.blockType)
  if (!normal) return false
  const group = createTorchGroup(bx, by, bz, normal)
  if (typeof params.torchContainer !== 'undefined') {
    params.torchContainer.add(group)
    params.placedTorches.push({
      bx,
      by,
      bz,
      nx: normal.x,
      ny: normal.y,
      nz: normal.z,
      group,
      chunkKeyNum: params.chunkKeyNum,
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
}): boolean {
  const idx = params.placedTorches.findIndex(
    (t) => t.bx === params.bx && t.by === params.by && t.bz === params.bz,
  )
  if (idx < 0) return false
  const t = params.placedTorches[idx]
  params.placedTorches.splice(idx, 1)
  if (typeof params.torchContainer !== 'undefined') params.torchContainer.remove(t.group)
  return true
}

/**
 * Removes all torches that belong to the given chunk key (called on chunk unload/refresh).
 */
export function removeTorchesInChunk(params: {
  chunkKeyNum: number
  torchContainer: THREE.Group | undefined
  placedTorches: PlacedTorch[]
}): void {
  for (let i = params.placedTorches.length - 1; i >= 0; i--) {
    const t = params.placedTorches[i]
    if (t.chunkKeyNum !== params.chunkKeyNum) continue
    params.placedTorches.splice(i, 1)
    if (typeof params.torchContainer !== 'undefined') params.torchContainer.remove(t.group)
  }
}

/** Applies current torch shadow setting to all placed torch lights (e.g. after options change). */
export function applyTorchShadowSettingsToPlacedTorches(placedTorches: PlacedTorch[]): void {
  for (const t of placedTorches) {
    const child = t.group.children[2]
    if (child instanceof THREE.PointLight) applyTorchShadowSetting(child)
  }
}

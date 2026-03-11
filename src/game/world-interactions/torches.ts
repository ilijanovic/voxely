import * as THREE from 'three'
import { getShadowsEnabled, getTorchShadowsEnabled } from '../../graphics-settings'

export type PlacedTorch = {
  x: number
  y: number
  z: number
  group: THREE.Group
}

export function createTorchGroup(worldX: number, worldY: number, worldZ: number): THREE.Group {
  const group = new THREE.Group()
  group.position.set(worldX, worldY, worldZ)

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

  const light = new THREE.PointLight(0xffaa44, 5, 40)
  light.position.y = 0.5
  applyTorchShadowSetting(light)
  group.add(light)

  return group
}

export function applyTorchShadowSetting(light: THREE.PointLight): void {
  const enabled = getShadowsEnabled() && getTorchShadowsEnabled()
  light.castShadow = enabled
  if (enabled) {
    light.shadow.mapSize.width = 256
    light.shadow.mapSize.height = 256
    light.shadow.camera.near = 0.5
    light.shadow.camera.far = 25
    light.shadow.bias = -0.0001
  }
}

export function placeTorch(params: {
  worldX: number
  worldY: number
  worldZ: number
  torchContainer: THREE.Group | undefined
  placedTorches: PlacedTorch[]
  blockKeyNumeric: (x: number, y: number, z: number) => number
}): boolean {
  const keyNum = params.blockKeyNumeric(params.worldX, params.worldY, params.worldZ)
  if (params.placedTorches.some((t) => params.blockKeyNumeric(t.x, t.y, t.z) === keyNum)) {
    return false
  }
  const group = createTorchGroup(params.worldX, params.worldY, params.worldZ)
  if (typeof params.torchContainer !== 'undefined') {
    params.torchContainer.add(group)
    params.placedTorches.push({
      x: params.worldX,
      y: params.worldY,
      z: params.worldZ,
      group,
    })
    return true
  }
  return false
}

export function applyTorchShadowSettingsToPlacedTorches(placedTorches: PlacedTorch[]): void {
  for (const t of placedTorches) {
    const child = t.group.children[2]
    if (child instanceof THREE.PointLight) applyTorchShadowSetting(child)
  }
}

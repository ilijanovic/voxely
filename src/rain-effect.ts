/**
 * Visual rain effect: falling particles when global weather is rain and not in cold biomes.
 * Snow takes precedence in cold biomes.
 */
import * as THREE from '@/three'
import type { Biome } from './types'
import { getWeather } from './weather'

const PARTICLE_COUNT = 4000
const BOX_WIDTH = 35
const BOX_HEIGHT = 22
const BOX_DEPTH = 35
const FALL_SPEED = 12
const DRIFT_AMPLITUDE = 0.2
const RESPAWN_BELOW_PLAYER = 6
const RESPAWN_DISTANCE_SQ = 30 * 30
const SEED_OFFSET = 67890

const COLD_BIOMES: Set<Biome> = new Set([
  'snow',
  'grove',
  'snowy_slopes',
  'frozen_peaks',
  'jagged_peaks',
])

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

export interface RainEffectContext {
  playerPosition: THREE.Vector3
  waterSurfaceY: number
  eyeY: number
  biome?: Biome
}

export interface RainEffect {
  update(dt: number, ctx: RainEffectContext): void
  isRaining(ctx: RainEffectContext): boolean
}

/**
 * Returns true when rain particles should be shown (weather is rain, above water, not in cold biome).
 */
export function createRainEffect(scene: THREE.Scene): RainEffect {
  const positions = new Float32Array(PARTICLE_COUNT * 3)
  let seed = SEED_OFFSET
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3] = (seededRandom(++seed) - 0.5) * BOX_WIDTH
    positions[i * 3 + 1] = seededRandom(++seed) * BOX_HEIGHT
    positions[i * 3 + 2] = (seededRandom(++seed) - 0.5) * BOX_DEPTH
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    color: 0x8899aa,
    size: 0.06,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    fog: true,
  })

  const mesh = new THREE.Points(geometry, material)
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.frustumCulled = false
  scene.add(mesh)
  mesh.position.set(0, 0, 0)

  const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute
  const posArray = positionAttr.array as Float32Array
  let driftTime = 0
  let initialized = false

  function isRaining(ctx: RainEffectContext): boolean {
    if (getWeather() !== 'rain') return false
    if (ctx.eyeY < ctx.waterSurfaceY) return false
    if (ctx.biome !== undefined && COLD_BIOMES.has(ctx.biome)) return false
    return true
  }

  function update(dt: number, ctx: RainEffectContext): void {
    if (!isRaining(ctx)) {
      mesh.visible = false
      return
    }
    mesh.visible = true

    const px = ctx.playerPosition.x
    const py = ctx.playerPosition.y
    const pz = ctx.playerPosition.z
    const respawnY = py - RESPAWN_BELOW_PLAYER

    if (!initialized) {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3
        posArray[i3] = px + (seededRandom(++seed) - 0.5) * BOX_WIDTH
        posArray[i3 + 1] = py + seededRandom(++seed) * BOX_HEIGHT
        posArray[i3 + 2] = pz + (seededRandom(++seed) - 0.5) * BOX_DEPTH
      }
      initialized = true
    }

    driftTime += dt
    const driftX = Math.sin(driftTime * 0.4) * DRIFT_AMPLITUDE * dt
    const driftZ = Math.cos(driftTime * 0.35) * DRIFT_AMPLITUDE * dt

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      posArray[i3 + 1] -= FALL_SPEED * dt
      posArray[i3] += driftX
      posArray[i3 + 2] += driftZ

      const dx = posArray[i3] - px
      const dz = posArray[i3 + 2] - pz
      const distSq = dx * dx + dz * dz
      if (posArray[i3 + 1] < respawnY || distSq > RESPAWN_DISTANCE_SQ) {
        posArray[i3] = px + (seededRandom(++seed) - 0.5) * BOX_WIDTH
        posArray[i3 + 1] = py + seededRandom(++seed) * BOX_HEIGHT
        posArray[i3 + 2] = pz + (seededRandom(++seed) - 0.5) * BOX_DEPTH
      }
    }
    positionAttr.needsUpdate = true
  }

  return { update, isRaining }
}

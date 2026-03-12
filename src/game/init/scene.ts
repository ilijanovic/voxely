import * as THREE from '@/three'
import {
  getAntialias,
  getFovNormal,
  getShadowsEnabled,
  getToneMappingEnabled,
  getToneMappingExposure,
  getShadowMapType,
} from '../../graphics-settings'

export type SceneInitResult = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGPURenderer
  torchContainer: THREE.Group
  fpsEl: HTMLElement | null
}

/**
 * Creates scene, camera, and WebGPU renderer. Must be awaited; call await renderer.init() before first render if not using setAnimationLoop.
 */
export async function initSceneAndRenderer(container?: HTMLElement): Promise<SceneInitResult> {
  const scene = new THREE.Scene()
  const torchContainer = new THREE.Group()
  scene.add(torchContainer)
  scene.fog = new THREE.Fog(0x87ceeb, 80, 280)

  const camera = new THREE.PerspectiveCamera(
    getFovNormal(),
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
  )
  scene.add(camera)

  let renderer: THREE.WebGPURenderer
  try {
    renderer = new THREE.WebGPURenderer({ antialias: getAntialias() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    throw new Error(
      `WebGPU renderer could not be created. The game requires hardware-accelerated graphics. ${msg}`,
      { cause: err },
    )
  }
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = getToneMappingEnabled() ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping
  renderer.toneMappingExposure = getToneMappingEnabled() ? getToneMappingExposure() : 1
  renderer.shadowMap.enabled = getShadowsEnabled()
  renderer.shadowMap.type =
    getShadowMapType() === 'pcf_soft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
  ;(container ?? document.body).appendChild(renderer.domElement)

  await renderer.init()

  const fpsEl = document.getElementById('fps')
  return { scene, camera, renderer, torchContainer, fpsEl }
}

import * as THREE from 'three'
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
  renderer: THREE.WebGLRenderer
  torchContainer: THREE.Group
  fpsEl: HTMLElement | null
}

export function initSceneAndRenderer(container?: HTMLElement): SceneInitResult {
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

  const renderer = new THREE.WebGLRenderer({ antialias: getAntialias() })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = getToneMappingEnabled() ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping
  renderer.toneMappingExposure = getToneMappingEnabled() ? getToneMappingExposure() : 1
  renderer.shadowMap.enabled = getShadowsEnabled()
  renderer.shadowMap.type =
    getShadowMapType() === 'pcf_soft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
  ;(container ?? document.body).appendChild(renderer.domElement)

  const fpsEl = document.getElementById('fps')
  return { scene, camera, renderer, torchContainer, fpsEl }
}

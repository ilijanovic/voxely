import * as THREE from '@/three'
import {
  uniform,
  mix,
  smoothstep,
  vec3,
  vec4,
  positionLocal,
  normalize,
  min,
  clamp,
  float,
} from 'three/tsl'
import { getShadowMapSize } from '../../graphics-settings'
import { SUN_DISTANCE } from '../../atmosphere'

/**
 * Sky uniform nodes; atmosphere updates .value each frame.
 */
export interface SkyUniforms {
  uTopColor: ReturnType<typeof uniform>
  uHorizonColor: ReturnType<typeof uniform>
  uBottomColor: ReturnType<typeof uniform>
  uSunHeight: ReturnType<typeof uniform>
}

/**
 * Creates a TSL NodeMaterial for the sky dome with the same gradient/sunset logic as the former ShaderMaterial.
 */
function createSkyNodeMaterial(): { material: THREE.NodeMaterial; uniforms: SkyUniforms } {
  const uTopColor = uniform(new THREE.Color(0x87ceeb))
  const uHorizonColor = uniform(new THREE.Color(0xb8dce8))
  const uBottomColor = uniform(new THREE.Color(0xdceef7))
  const uSunHeight = uniform(1.0)

  const material = new THREE.NodeMaterial()
  const pl = positionLocal
  const t = normalize(pl).y.mul(0.5).add(0.5)
  let color = mix(uBottomColor, uHorizonColor, smoothstep(float(0), float(0.5), t))
  color = mix(color, uTopColor, smoothstep(float(0.5), float(1), t))
  const sunset = smoothstep(float(-0.45), float(0.25), uSunHeight).mul(
    float(1).sub(smoothstep(float(0.25), float(0.65), uSunHeight)),
  )
  const sunsetClamped = min(float(1), sunset.mul(1.4))
  const sunsetColor = vec3(1, 0.35, 0.05)
  const morning = smoothstep(float(0.08), float(0.35), uSunHeight).mul(
    float(1).sub(smoothstep(float(0.35), float(0.75), uSunHeight)),
  )
  const morningClamped = min(float(1), morning.mul(1.2))
  const morningColor = vec3(1, 0.75, 0.5)
  const horizonBand = smoothstep(float(0), float(0.18), min(t, float(1).sub(t)))
  color = mix(color, sunsetColor, sunsetClamped.mul(horizonBand))
  color = mix(color, morningColor, morningClamped.mul(horizonBand))
  const night = clamp(uSunHeight.mul(-2), float(0), float(1))
  color = mix(color, vec3(0.01, 0.02, 0.05), night)
  material.fragmentNode = vec4(color, 1)
  material.depthWrite = false
  material.side = THREE.BackSide
  material.fog = false
  return {
    material,
    uniforms: { uTopColor, uHorizonColor, uBottomColor, uSunHeight },
  }
}

export interface LightsAndSky {
  sunLight: THREE.DirectionalLight
  sunMesh: THREE.Mesh
  moonMesh: THREE.Mesh
  sky: THREE.Mesh
  clouds: THREE.Group
  cloudMaterial: THREE.MeshBasicMaterial
  stars: THREE.Points
  ambientLight: THREE.AmbientLight
  hemiLight: THREE.HemisphereLight
}

export function initLightsAndSky(scene: THREE.Scene, shadowRadius: number): LightsAndSky {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.25)
  scene.add(ambientLight)
  const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x665544, 0.6)
  scene.add(hemiLight)

  const sunLight = new THREE.DirectionalLight(0xfffaf0, 1.2)
  sunLight.castShadow = true
  const shadowSize = getShadowMapSize()
  sunLight.shadow.mapSize.width = shadowSize
  sunLight.shadow.mapSize.height = shadowSize
  sunLight.shadow.camera.near = 0.5
  sunLight.shadow.camera.far = SUN_DISTANCE + 80
  sunLight.shadow.camera.left = -shadowRadius
  sunLight.shadow.camera.right = shadowRadius
  sunLight.shadow.camera.top = shadowRadius
  sunLight.shadow.camera.bottom = -shadowRadius
  sunLight.shadow.camera.updateProjectionMatrix()
  sunLight.shadow.bias = -0.0003
  sunLight.shadow.normalBias = 0.008
  const initSunDir = new THREE.Vector3(1, 0.3, 0.5).normalize()
  sunLight.position.copy(initSunDir).multiplyScalar(SUN_DISTANCE)
  sunLight.target.position.set(0, 0, 0)
  scene.add(sunLight)
  scene.add(sunLight.target)

  const sunGeometry = new THREE.SphereGeometry(12, 24, 24)
  const sunMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff4c4,
    fog: false,
  })
  const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial)
  sunMesh.castShadow = false
  sunMesh.receiveShadow = false
  scene.add(sunMesh)

  const moonGeometry = new THREE.SphereGeometry(8, 16, 16)
  const moonMaterial = new THREE.MeshBasicMaterial({
    color: 0xe6ecff,
    fog: false,
  })
  const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial)
  moonMesh.castShadow = false
  moonMesh.receiveShadow = false
  scene.add(moonMesh)

  const skyGeo = new THREE.SphereGeometry(500, 32, 32)
  skyGeo.scale(-1, 1, 1)
  const { material: skyMat, uniforms: skyUniforms } = createSkyNodeMaterial()
  ;(skyMat as unknown as { uniforms: SkyUniforms }).uniforms = skyUniforms
  const sky = new THREE.Mesh(skyGeo, skyMat)
  sky.castShadow = false
  sky.receiveShadow = false
  scene.add(sky)

  const clouds = new THREE.Group()
  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  })
  const cloudHeight = 120
  const cloudArea = 420
  const cloudCount = 125
  for (let i = 0; i < cloudCount; i++) {
    const cloud = new THREE.Group()
    const blocks = 12 + Math.floor(Math.random() * 14)
    const cloudSpread = 18 + Math.random() * 12
    for (let j = 0; j < blocks; j++) {
      const w = 5 + Math.random() * 6
      const h = 1.2 + Math.random() * 0.8
      const d = 5 + Math.random() * 6
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cloudMaterial)
      box.castShadow = false
      box.receiveShadow = false
      box.position.set(
        (Math.random() - 0.5) * cloudSpread,
        (Math.random() - 0.3) * 2,
        (Math.random() - 0.5) * cloudSpread,
      )
      cloud.add(box)
    }
    cloud.position.set(
      (Math.random() - 0.5) * cloudArea,
      cloudHeight + (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * cloudArea,
    )
    clouds.add(cloud)
  }
  scene.add(clouds)

  const starGeometry = new THREE.BufferGeometry()
  const starCount = 2000
  const starPositions = new Float32Array(starCount * 3)
  for (let i = 0; i < starCount; i++) {
    const r = 450
    const theta = Math.random() * Math.PI * 2
    const phi = Math.random() * Math.PI
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    starPositions[i * 3 + 1] = r * Math.cos(phi)
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
  }
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.8,
    sizeAttenuation: true,
    transparent: true,
  })
  const stars = new THREE.Points(starGeometry, starMaterial)
  stars.castShadow = false
  stars.receiveShadow = false
  scene.add(stars)

  return {
    sunLight,
    sunMesh,
    moonMesh,
    sky,
    clouds,
    cloudMaterial,
    stars,
    ambientLight,
    hemiLight,
  }
}

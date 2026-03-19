/**
 * Day/night cycle state and sky/fog/lighting updates.
 * Game passes scene, renderer, lights, and meshes; this module updates them each frame.
 */
import * as THREE from 'three'

const DAY_DURATION = 900
const SUN_DISTANCE = 200
const SUN_SHADOW_MIN_HEIGHT = 0.15
const DEFAULT_CLOUD_AREA = 420
const DEFAULT_CLOUD_WEST_SPEED = 1

let dayTime = 0
let wasUnderwater = false

const _sunDirection = new THREE.Vector3(1, 1.2, 0.5).normalize()
const _sunPos = new THREE.Vector3()
const _moonPos = new THREE.Vector3()
const _clearColorTemp = new THREE.Color()

const _clearDay = new THREE.Color(0x87ceeb)
const _clearGolden = new THREE.Color(0xd49a6a)
const _clearDusk = new THREE.Color(0x3a2050)
const _clearNight = new THREE.Color(0x06101e)
const _fogDay = new THREE.Color(0x9fc4d8)
const _fogGolden = new THREE.Color(0xc98f65)
const _fogDusk = new THREE.Color(0x2a1840)
const _fogNight = new THREE.Color(0x0b0f1a)
const _skyTopDay = new THREE.Color(0x4a9eda)
const _skyTopGolden = new THREE.Color(0x5a3888)
const _skyTopNight = new THREE.Color(0x03070f)
const _skyHorizonDay = new THREE.Color(0xa8ddf0)
const _skyHorizonGolden = new THREE.Color(0xe8a050)
const _skyHorizonDusk = new THREE.Color(0x4a1f5a)
const _skyHorizonNight = new THREE.Color(0x070d18)
const _skyBottomDay = new THREE.Color(0xd0eef8)
const _skyBottomGolden = new THREE.Color(0xe8aa66)
const _skyBottomNight = new THREE.Color(0x020509)
const _sunColorOrange = new THREE.Color(0xffb366)
const _sunColorWarm = new THREE.Color(0xffddaa)
const _sunDiscOrange = new THREE.Color(0xffaa55)
const _hemiAmber = new THREE.Color(0xe0a878)
const _hemiPurple = new THREE.Color(0x2a1540)
const _cloudGolden = new THREE.Color(0xe8b8a8)
const _cloudNight = new THREE.Color(0x666688)
const _cloudRainSnow = new THREE.Color(0x8a8e98)
const underwaterFogColor = new THREE.Color(0x0d2840)

export function getDayTime(): number {
  return dayTime
}

export function setDayTime(t: number): void {
  dayTime = t
}

/** True when the sun is below horizon (used for hostile mob spawn: spawn only at night). */
export function isNight(): boolean {
  const t = dayTime % 1
  const sunAngle = t * Math.PI * 2
  const sunHeight = Math.sin(sunAngle)
  return sunHeight < 0
}

export function getSunDirection(): THREE.Vector3 {
  return _sunDirection
}

export interface AtmosphereContext {
  playerPosition: THREE.Vector3
  viewMode: 'first' | 'third'
  eyeHeight: number
  cameraHeight: number
  waterLevel: number
  waterBlockHeight: number
  scene: THREE.Scene
  renderer: THREE.WebGLRenderer
  sunLight: THREE.DirectionalLight
  sunMesh: THREE.Mesh
  moonMesh: THREE.Mesh
  sky: THREE.Mesh
  stars: THREE.Points
  clouds: THREE.Group
  cloudMaterial: THREE.MeshBasicMaterial
  /** Whether snow particles are currently shown (cold biome, above water). */
  isSnowing: boolean
  ambientLight: THREE.AmbientLight
  hemiLight: THREE.HemisphereLight
}

export function updateAtmosphere(dt: number, ctx: AtmosphereContext): void {
  dayTime += dt / DAY_DURATION

  const sunAngle = dayTime * Math.PI * 2
  _sunDirection.set(Math.cos(sunAngle), Math.sin(sunAngle), 0.3).normalize()
  const sunHeight = _sunDirection.y
  const daylight = Math.max(0, sunHeight)
  const goldenHour = Math.max(0, 1 - (sunHeight * sunHeight) / 0.09)
  const sunriseSet = goldenHour * Math.max(0, 1 + sunHeight / 0.35)
  const twilight = THREE.MathUtils.clamp(1 + sunHeight / 0.25, 0, 1)
  const night = THREE.MathUtils.clamp(-sunHeight * 2.2, 0, 1)

  const eyeY = ctx.playerPosition.y + (ctx.viewMode === 'first' ? ctx.eyeHeight : ctx.cameraHeight)
  const waterSurfaceY = ctx.waterLevel + ctx.waterBlockHeight
  const isUnderwater = eyeY < waterSurfaceY
  const isPrecipitating = !isUnderwater && ctx.isSnowing
  const cloudAreaRaw = Number(ctx.clouds.userData.cloudArea)
  const cloudArea = Number.isFinite(cloudAreaRaw) && cloudAreaRaw > 0 ? cloudAreaRaw : DEFAULT_CLOUD_AREA
  const cloudWestSpeedRaw = Number(ctx.clouds.userData.cloudWestSpeed)
  const cloudWestSpeed =
    Number.isFinite(cloudWestSpeedRaw) && cloudWestSpeedRaw >= 0
      ? cloudWestSpeedRaw
      : DEFAULT_CLOUD_WEST_SPEED
  const halfCloudArea = cloudArea * 0.5

  // Clouds are world-anchored: they drift west and recycle when they leave the
  // player's nearby area, which keeps new clouds appearing ahead while traveling.
  const cloudDrift = cloudWestSpeed * dt
  const minCloudX = ctx.playerPosition.x - halfCloudArea
  const maxCloudX = ctx.playerPosition.x + halfCloudArea
  const minCloudZ = ctx.playerPosition.z - halfCloudArea
  const maxCloudZ = ctx.playerPosition.z + halfCloudArea
  for (const cloud of ctx.clouds.children) {
    cloud.position.x -= cloudDrift
    while (cloud.position.x < minCloudX) cloud.position.x += cloudArea
    while (cloud.position.x > maxCloudX) cloud.position.x -= cloudArea
    while (cloud.position.z < minCloudZ) cloud.position.z += cloudArea
    while (cloud.position.z > maxCloudZ) cloud.position.z -= cloudArea
  }

  if (isUnderwater !== wasUnderwater) {
    wasUnderwater = isUnderwater
    if (isUnderwater) {
      ctx.renderer.setClearColor(underwaterFogColor)
      if (ctx.scene.fog && 'far' in ctx.scene.fog) {
        ctx.scene.fog.color.copy(underwaterFogColor)
        ctx.scene.fog.near = 2
        ctx.scene.fog.far = 35
      }
      const skyMatUnderwater = ctx.sky.material as THREE.ShaderMaterial
      skyMatUnderwater.uniforms.uTopColor.value.set(0x02040a)
      skyMatUnderwater.uniforms.uHorizonColor.value.set(0x05070f)
      skyMatUnderwater.uniforms.uBottomColor.value.set(0x0d2840)
    }
  }
  if (!isUnderwater) {
    const precipDarken = ctx.isSnowing ? 0.08 : 0
    _clearColorTemp
      .copy(_clearDay)
      .lerp(_clearGolden, sunriseSet)
      .lerp(_clearDusk, twilight * night * 0.8)
      .lerp(_clearNight, Math.pow(night, 1.4))
    if (precipDarken > 0) _clearColorTemp.lerp(new THREE.Color(0x4a5568), precipDarken)
    ctx.renderer.setClearColor(_clearColorTemp)

    if (ctx.scene.fog && 'far' in ctx.scene.fog) {
      ctx.scene.fog.color
        .copy(_fogDay)
        .lerp(_fogGolden, sunriseSet)
        .lerp(_fogDusk, twilight * night * 0.8)
        .lerp(_fogNight, Math.pow(night, 1.4))
      if (precipDarken > 0) ctx.scene.fog.color.lerp(new THREE.Color(0x5a6578), precipDarken)
      if (isPrecipitating) {
        ctx.scene.fog.near = 45
        ctx.scene.fog.far = 165
      } else {
        ctx.scene.fog.near = 80
        ctx.scene.fog.far = 280
      }
    }
  }

  const nightMin = 1 - daylight
  const ambientBase = 0.08 + daylight * 0.45
  const hemiBase = 0.08 + daylight * 0.7
  ctx.ambientLight.intensity = isUnderwater ? 0.15 : Math.max(ambientBase, nightMin * 0.28)
  ctx.hemiLight.intensity = isUnderwater ? 0.4 : Math.max(hemiBase, nightMin * 0.35)

  if (!isUnderwater) {
    _sunPos.copy(ctx.playerPosition).addScaledVector(_sunDirection, SUN_DISTANCE)
    ctx.sunMesh.position.copy(_sunPos)

    const precipSunScale = isPrecipitating ? 0.9 : 1
    ctx.sunLight.intensity = (Math.max(0, sunHeight) * 1.8 + sunriseSet * 0.4) * precipSunScale
    ctx.sunLight.color
      .set(0xfffaf0)
      .lerp(_sunColorOrange, sunriseSet)
      .lerp(_sunColorWarm, Math.max(0, sunHeight) * 0.3)
    ;(ctx.sunMesh.material as THREE.MeshBasicMaterial).color
      .set(0xfff4c4)
      .lerp(_sunDiscOrange, sunriseSet)
    ctx.hemiLight.color
      .set(0x87ceeb)
      .lerp(_hemiAmber, sunriseSet)
      .lerp(_hemiPurple, Math.pow(night, 0.7))
    ctx.sunLight.castShadow = _sunDirection.y >= SUN_SHADOW_MIN_HEIGHT
    ctx.sunMesh.visible = _sunDirection.y > -0.2

    const moonDirection = _sunDirection.clone().multiplyScalar(-1)
    _moonPos.copy(ctx.playerPosition).addScaledVector(moonDirection, SUN_DISTANCE)
    ctx.moonMesh.position.copy(_moonPos)
    ctx.moonMesh.visible = _sunDirection.y < 0

    ctx.stars.position.copy(ctx.playerPosition)
    const nightAmount = Math.pow(Math.max(0, -_sunDirection.y), 1.8)
    ;(ctx.stars.material as THREE.PointsMaterial).opacity = nightAmount

    const skyMat = ctx.sky.material as THREE.ShaderMaterial
    skyMat.uniforms.uSunHeight.value = _sunDirection.y

    const precipSkyDarken = ctx.isSnowing ? 0.08 : 0
    _clearColorTemp
      .copy(_skyTopDay)
      .lerp(_skyTopGolden, sunriseSet * 0.8)
      .lerp(_skyTopNight, Math.pow(night, 1.1))
    if (precipSkyDarken > 0) _clearColorTemp.lerp(new THREE.Color(0x3d4a5c), precipSkyDarken)
    skyMat.uniforms.uTopColor.value.copy(_clearColorTemp)

    _clearColorTemp
      .copy(_skyHorizonDay)
      .lerp(_skyHorizonGolden, sunriseSet)
      .lerp(_skyHorizonDusk, Math.max(0, night - 0.2) * twilight)
      .lerp(_skyHorizonNight, Math.pow(night, 1.3))
    if (precipSkyDarken > 0) _clearColorTemp.lerp(new THREE.Color(0x5a6578), precipSkyDarken)
    skyMat.uniforms.uHorizonColor.value.copy(_clearColorTemp)

    _clearColorTemp
      .copy(_skyBottomDay)
      .lerp(_skyBottomGolden, sunriseSet)
      .lerp(_skyBottomNight, Math.pow(night, 1.1))
    if (precipSkyDarken > 0) _clearColorTemp.lerp(new THREE.Color(0x4a5568), precipSkyDarken)
    skyMat.uniforms.uBottomColor.value.copy(_clearColorTemp)

    ctx.clouds.visible = true
    ctx.cloudMaterial.opacity = isPrecipitating ? 0.92 : 0.6 + daylight * 0.35
    ctx.cloudMaterial.color.set(0xffffff).lerp(_cloudGolden, sunriseSet).lerp(_cloudNight, night)
    if (isPrecipitating) ctx.cloudMaterial.color.lerp(_cloudRainSnow, 0.55)
  } else {
    ctx.sunMesh.visible = false
    ctx.moonMesh.visible = false
    ctx.stars.visible = false
    ctx.clouds.visible = false
  }
  ctx.sky.position.copy(ctx.playerPosition)
}

export { SUN_DISTANCE }

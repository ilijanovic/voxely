/**
 * Graphics settings – changeable at runtime (e.g. from the options menu).
 * game.ts reads these values; the options UI writes them.
 * Values are persisted in localStorage.
 */

const STORAGE_KEY = 'voxel-graphics-settings'

export type ShadowMapType = 'pcf' | 'pcf_soft'

const defaults = {
  renderDistance: 4,
  shadowsEnabled: true,
  torchShadowsEnabled: false,
  antialias: true,
  fovNormal: 70,
  fovSprint: 88,
  pointerSpeed: 1,
  pointerSpeedSprint: 1.3,
  shadowMapSize: 1024 as 512 | 1024 | 2048,
  toneMappingEnabled: true,
  toneMappingExposure: 1.1,
  shadowMapType: 'pcf' as ShadowMapType,
  fogNoiseEnabled: true,
  bloomEnabled: false,
  bloomStrength: 0.15,
  bloomRadius: 0.3,
  bloomThreshold: 0.9,
}

const state = {
  renderDistance: defaults.renderDistance,
  shadowsEnabled: defaults.shadowsEnabled,
  torchShadowsEnabled: defaults.torchShadowsEnabled,
  antialias: defaults.antialias,
  fovNormal: defaults.fovNormal,
  fovSprint: defaults.fovSprint,
  pointerSpeed: defaults.pointerSpeed,
  pointerSpeedSprint: defaults.pointerSpeedSprint,
  shadowMapSize: defaults.shadowMapSize,
  toneMappingEnabled: defaults.toneMappingEnabled,
  toneMappingExposure: defaults.toneMappingExposure,
  shadowMapType: defaults.shadowMapType,
  fogNoiseEnabled: defaults.fogNoiseEnabled,
  bloomEnabled: defaults.bloomEnabled,
  bloomStrength: defaults.bloomStrength,
  bloomRadius: defaults.bloomRadius,
  bloomThreshold: defaults.bloomThreshold,
}

function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw) as Partial<typeof state>
    if (typeof data.renderDistance === 'number') {
      state.renderDistance = Math.max(2, Math.min(12, Math.round(data.renderDistance)))
    }
    if (typeof data.shadowsEnabled === 'boolean') state.shadowsEnabled = data.shadowsEnabled
    if (typeof data.torchShadowsEnabled === 'boolean')
      state.torchShadowsEnabled = data.torchShadowsEnabled
    if (typeof data.antialias === 'boolean') state.antialias = data.antialias
    if (typeof data.fovNormal === 'number') {
      state.fovNormal = Math.max(60, Math.min(120, data.fovNormal))
    }
    if (typeof data.fovSprint === 'number') {
      state.fovSprint = Math.max(60, Math.min(120, data.fovSprint))
    }
    if (typeof data.pointerSpeed === 'number') {
      state.pointerSpeed = Math.max(0.1, Math.min(5, data.pointerSpeed))
    }
    if (typeof data.pointerSpeedSprint === 'number') {
      state.pointerSpeedSprint = Math.max(0.1, Math.min(5, data.pointerSpeedSprint))
    }
    if ([512, 1024, 2048].includes(Number(data.shadowMapSize))) {
      state.shadowMapSize = data.shadowMapSize as 512 | 1024 | 2048
    }
    if (typeof data.toneMappingEnabled === 'boolean')
      state.toneMappingEnabled = data.toneMappingEnabled
    if (typeof data.toneMappingExposure === 'number') {
      state.toneMappingExposure = Math.max(0.5, Math.min(2, data.toneMappingExposure))
    }
    if (data.shadowMapType === 'pcf' || data.shadowMapType === 'pcf_soft') {
      state.shadowMapType = data.shadowMapType
    }
    if (typeof data.fogNoiseEnabled === 'boolean') {
      state.fogNoiseEnabled = data.fogNoiseEnabled
    }
    if (typeof data.bloomEnabled === 'boolean') state.bloomEnabled = data.bloomEnabled
    if (typeof data.bloomStrength === 'number') {
      state.bloomStrength = Math.max(0, Math.min(1.2, data.bloomStrength))
    }
    if (typeof data.bloomRadius === 'number') {
      state.bloomRadius = Math.max(0, Math.min(1, data.bloomRadius))
    }
    if (typeof data.bloomThreshold === 'number') {
      state.bloomThreshold = Math.max(0, Math.min(1, data.bloomThreshold))
    }
  } catch {
    // invalid data → keep defaults
  }
}

function saveToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getGraphicsState()))
  } catch {
    // quota exceeded or disabled
  }
}

loadFromStorage()

export function getRenderDistance(): number {
  return state.renderDistance
}

export function getRenderDistanceSq(): number {
  return state.renderDistance * state.renderDistance
}

export function getShadowsEnabled(): boolean {
  return state.shadowsEnabled
}

export function getTorchShadowsEnabled(): boolean {
  return state.torchShadowsEnabled
}

export function getAntialias(): boolean {
  return state.antialias
}

export function getFovNormal(): number {
  return state.fovNormal
}

export function getFovSprint(): number {
  return state.fovSprint
}

export function getPointerSpeed(): number {
  return state.pointerSpeed
}

export function getPointerSpeedSprint(): number {
  return state.pointerSpeedSprint
}

export function getShadowMapSize(): number {
  return state.shadowMapSize
}

export function getToneMappingEnabled(): boolean {
  return state.toneMappingEnabled
}

export function getToneMappingExposure(): number {
  return state.toneMappingExposure
}

export function getShadowMapType(): ShadowMapType {
  return state.shadowMapType
}

/**
 * Returns whether fog density noise modulation is enabled.
 */
export function getFogNoiseEnabled(): boolean {
  return state.fogNoiseEnabled
}

export function setRenderDistance(value: number): void {
  state.renderDistance = Math.max(2, Math.min(12, Math.round(value)))
  saveToStorage()
}

export function setShadowsEnabled(value: boolean): void {
  state.shadowsEnabled = value
  saveToStorage()
}

export function setTorchShadowsEnabled(value: boolean): void {
  state.torchShadowsEnabled = value
  saveToStorage()
}

export function setAntialias(value: boolean): void {
  state.antialias = value
  saveToStorage()
}

export function setFovNormal(value: number): void {
  state.fovNormal = Math.max(60, Math.min(120, value))
  saveToStorage()
}

export function setFovSprint(value: number): void {
  state.fovSprint = Math.max(60, Math.min(120, value))
  saveToStorage()
}

export function setPointerSpeed(value: number): void {
  state.pointerSpeed = Math.max(0.1, Math.min(5, value))
  saveToStorage()
}

export function setPointerSpeedSprint(value: number): void {
  state.pointerSpeedSprint = Math.max(0.1, Math.min(5, value))
  saveToStorage()
}

export function setShadowMapSize(value: 512 | 1024 | 2048): void {
  state.shadowMapSize = value
  saveToStorage()
}

export function setToneMappingEnabled(value: boolean): void {
  state.toneMappingEnabled = value
  saveToStorage()
}

export function setToneMappingExposure(value: number): void {
  state.toneMappingExposure = Math.max(0.5, Math.min(2, value))
  saveToStorage()
}

export function setShadowMapType(value: ShadowMapType): void {
  state.shadowMapType = value
  saveToStorage()
}

/**
 * Enables or disables fog density noise modulation and persists the setting.
 *
 * @param value - True to enable fog noise, false to disable
 */
export function setFogNoiseEnabled(value: boolean): void {
  state.fogNoiseEnabled = value
  saveToStorage()
}

export function getBloomEnabled(): boolean {
  return state.bloomEnabled
}

export function getBloomStrength(): number {
  return state.bloomStrength
}

export function getBloomRadius(): number {
  return state.bloomRadius
}

export function getBloomThreshold(): number {
  return state.bloomThreshold
}

export function setBloomEnabled(value: boolean): void {
  state.bloomEnabled = value
  saveToStorage()
}

export function setBloomStrength(value: number): void {
  state.bloomStrength = Math.max(0, Math.min(1.2, value))
  saveToStorage()
}

export function setBloomRadius(value: number): void {
  state.bloomRadius = Math.max(0, Math.min(1, value))
  saveToStorage()
}

export function setBloomThreshold(value: number): void {
  state.bloomThreshold = Math.max(0, Math.min(1, value))
  saveToStorage()
}

export function getGraphicsState() {
  return {
    renderDistance: state.renderDistance,
    shadowsEnabled: state.shadowsEnabled,
    torchShadowsEnabled: state.torchShadowsEnabled,
    antialias: state.antialias,
    fovNormal: state.fovNormal,
    fovSprint: state.fovSprint,
    pointerSpeed: state.pointerSpeed,
    pointerSpeedSprint: state.pointerSpeedSprint,
    shadowMapSize: state.shadowMapSize,
    toneMappingEnabled: state.toneMappingEnabled,
    toneMappingExposure: state.toneMappingExposure,
    shadowMapType: state.shadowMapType,
    fogNoiseEnabled: state.fogNoiseEnabled,
    bloomEnabled: state.bloomEnabled,
    bloomStrength: state.bloomStrength,
    bloomRadius: state.bloomRadius,
    bloomThreshold: state.bloomThreshold,
  }
}

/**
 * Graphics settings – changeable at runtime (e.g. from the options menu).
 * game.ts reads these values; the options UI writes them.
 * Values are persisted in localStorage.
 */

const STORAGE_KEY = "voxel-graphics-settings";

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
};

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
};

function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as Partial<typeof state>;
    if (typeof data.renderDistance === "number") {
      state.renderDistance = Math.max(2, Math.min(12, Math.round(data.renderDistance)));
    }
    if (typeof data.shadowsEnabled === "boolean") state.shadowsEnabled = data.shadowsEnabled;
    if (typeof data.torchShadowsEnabled === "boolean") state.torchShadowsEnabled = data.torchShadowsEnabled;
    if (typeof data.antialias === "boolean") state.antialias = data.antialias;
    if (typeof data.fovNormal === "number") {
      state.fovNormal = Math.max(60, Math.min(120, data.fovNormal));
    }
    if (typeof data.fovSprint === "number") {
      state.fovSprint = Math.max(60, Math.min(120, data.fovSprint));
    }
    if (typeof data.pointerSpeed === "number") {
      state.pointerSpeed = Math.max(0.1, Math.min(5, data.pointerSpeed));
    }
    if (typeof data.pointerSpeedSprint === "number") {
      state.pointerSpeedSprint = Math.max(0.1, Math.min(5, data.pointerSpeedSprint));
    }
    if ([512, 1024, 2048].includes(Number(data.shadowMapSize))) {
      state.shadowMapSize = data.shadowMapSize as 512 | 1024 | 2048;
    }
  } catch {
    // invalid data → keep defaults
  }
}

function saveToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getGraphicsState()));
  } catch {
    // quota exceeded or disabled
  }
}

loadFromStorage();

export function getRenderDistance(): number {
  return state.renderDistance;
}

export function getRenderDistanceSq(): number {
  return state.renderDistance * state.renderDistance;
}

export function getShadowsEnabled(): boolean {
  return state.shadowsEnabled;
}

export function getTorchShadowsEnabled(): boolean {
  return state.torchShadowsEnabled;
}

export function getAntialias(): boolean {
  return state.antialias;
}

export function getFovNormal(): number {
  return state.fovNormal;
}

export function getFovSprint(): number {
  return state.fovSprint;
}

export function getPointerSpeed(): number {
  return state.pointerSpeed;
}

export function getPointerSpeedSprint(): number {
  return state.pointerSpeedSprint;
}

export function getShadowMapSize(): number {
  return state.shadowMapSize;
}

export function setRenderDistance(value: number): void {
  state.renderDistance = Math.max(2, Math.min(12, Math.round(value)));
  saveToStorage();
}

export function setShadowsEnabled(value: boolean): void {
  state.shadowsEnabled = value;
  saveToStorage();
}

export function setTorchShadowsEnabled(value: boolean): void {
  state.torchShadowsEnabled = value;
  saveToStorage();
}

export function setAntialias(value: boolean): void {
  state.antialias = value;
  saveToStorage();
}

export function setFovNormal(value: number): void {
  state.fovNormal = Math.max(60, Math.min(120, value));
  saveToStorage();
}

export function setFovSprint(value: number): void {
  state.fovSprint = Math.max(60, Math.min(120, value));
  saveToStorage();
}

export function setPointerSpeed(value: number): void {
  state.pointerSpeed = Math.max(0.1, Math.min(5, value));
  saveToStorage();
}

export function setPointerSpeedSprint(value: number): void {
  state.pointerSpeedSprint = Math.max(0.1, Math.min(5, value));
  saveToStorage();
}

export function setShadowMapSize(value: 512 | 1024 | 2048): void {
  state.shadowMapSize = value;
  saveToStorage();
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
  };
}

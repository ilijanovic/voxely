/**
 * Graphics settings – changeable at runtime (e.g. from the options menu).
 * game.ts reads these values; the options UI writes them.
 * Values are persisted in localStorage.
 */

const STORAGE_KEY = "voxel-graphics-settings";

const defaults = {
  renderDistance: 4,
  shadowsEnabled: true,
  antialias: true,
};

const state = {
  /** Render distance in chunks (circle around the player). 2–12. */
  renderDistance: defaults.renderDistance,
  /** Shadows on/off. */
  shadowsEnabled: defaults.shadowsEnabled,
  /** Antialiasing. */
  antialias: defaults.antialias,
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
    if (typeof data.antialias === "boolean") state.antialias = data.antialias;
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

export function getAntialias(): boolean {
  return state.antialias;
}

export function setRenderDistance(value: number): void {
  state.renderDistance = Math.max(2, Math.min(12, Math.round(value)));
  saveToStorage();
}

export function setShadowsEnabled(value: boolean): void {
  state.shadowsEnabled = value;
  saveToStorage();
}

export function setAntialias(value: boolean): void {
  state.antialias = value;
  saveToStorage();
}

export function getGraphicsState() {
  return {
    renderDistance: state.renderDistance,
    shadowsEnabled: state.shadowsEnabled,
    antialias: state.antialias,
  };
}

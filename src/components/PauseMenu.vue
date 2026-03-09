<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import {
  getGraphicsState,
  setRenderDistance,
  setShadowsEnabled,
  setTorchShadowsEnabled,
  setAntialias,
  setFovNormal,
  setFovSprint,
  setPointerSpeed,
  setPointerSpeedSprint,
  setShadowMapSize,
} from "../graphics-settings";
import {
  getKeyBindings,
  setKeyBinding,
  resetKeyBindingsToDefaults,
  keyActionLabels,
  keyActions,
  codeToDisplayName,
  type KeyAction,
} from "../key-settings";
import { applyGraphicsSettings } from "../game";
import {
  getAvailablePacks,
  getSelectedResourcePack,
  setSelectedResourcePack,
  type PackOption,
} from "../resource-pack-settings";

const emit = defineEmits<{ close: [] }>();

const view = ref<"main" | "options">("main");
const optionsTab = ref<"graphics" | "controls">("graphics");

// Graphics state
const renderDistance = ref(getGraphicsState().renderDistance);
const shadowsEnabled = ref(getGraphicsState().shadowsEnabled);
const torchShadowsEnabled = ref(getGraphicsState().torchShadowsEnabled);
const antialias = ref(getGraphicsState().antialias);
const fovNormal = ref(getGraphicsState().fovNormal);
const fovSprint = ref(getGraphicsState().fovSprint);
const pointerSpeed = ref(getGraphicsState().pointerSpeed);
const pointerSpeedSprint = ref(getGraphicsState().pointerSpeedSprint);
const shadowMapSize = ref(getGraphicsState().shadowMapSize);

// Controls: current bindings (reactive for UI)
const keyBindings = ref<Record<KeyAction, string>>(getKeyBindings());
const rebindingAction = ref<KeyAction | null>(null);

watch(
  [
    renderDistance,
    shadowsEnabled,
    torchShadowsEnabled,
    antialias,
    fovNormal,
    fovSprint,
    pointerSpeed,
    pointerSpeedSprint,
    shadowMapSize,
  ],
  () => {
    setRenderDistance(renderDistance.value);
    setShadowsEnabled(shadowsEnabled.value);
    setTorchShadowsEnabled(torchShadowsEnabled.value);
    setAntialias(antialias.value);
    setFovNormal(fovNormal.value);
    setFovSprint(fovSprint.value);
    setPointerSpeed(pointerSpeed.value);
    setPointerSpeedSprint(pointerSpeedSprint.value);
    setShadowMapSize(shadowMapSize.value as 512 | 1024 | 2048);
    applyGraphicsSettings();
  },
  { deep: true }
);

function openOptions() {
  view.value = "options";
  optionsTab.value = "graphics";
  loadPackOptions();
  const g = getGraphicsState();
  renderDistance.value = g.renderDistance;
  shadowsEnabled.value = g.shadowsEnabled;
  torchShadowsEnabled.value = g.torchShadowsEnabled;
  antialias.value = g.antialias;
  fovNormal.value = g.fovNormal;
  fovSprint.value = g.fovSprint;
  pointerSpeed.value = g.pointerSpeed;
  pointerSpeedSprint.value = g.pointerSpeedSprint;
  shadowMapSize.value = g.shadowMapSize;
  keyBindings.value = getKeyBindings();
  rebindingAction.value = null;
}

function back() {
  view.value = "main";
  rebindingAction.value = null;
}

function startRebind(action: KeyAction) {
  rebindingAction.value = action;
}

function onRebindKey(e: KeyboardEvent) {
  if (rebindingAction.value == null) return;
  e.preventDefault();
  e.stopPropagation();
  setKeyBinding(rebindingAction.value, e.code);
  keyBindings.value = getKeyBindings();
  rebindingAction.value = null;
}

function resetKeys() {
  resetKeyBindingsToDefaults();
  keyBindings.value = getKeyBindings();
}

const shadowMapSizeOptions = [
  { value: 512, label: "512 (schnell)" },
  { value: 1024, label: "1024" },
  { value: 2048, label: "2048 (qualität)" },
];

// Resource pack: list loaded async, selection persisted; change triggers reload
const packOptions = ref<PackOption[]>([]);
const selectedResourcePack = ref(getSelectedResourcePack());

function loadPackOptions() {
  getAvailablePacks().then((list) => {
    packOptions.value = list;
    selectedResourcePack.value = getSelectedResourcePack();
  });
}

function onResourcePackChange(newPath: string) {
  setSelectedResourcePack(newPath);
  selectedResourcePack.value = newPath;
  window.location.reload();
}

let rebindListener: ((e: KeyboardEvent) => void) | null = null;
onMounted(() => {
  rebindListener = (e: KeyboardEvent) => {
    if (rebindingAction.value != null) onRebindKey(e);
  };
  window.addEventListener("keydown", rebindListener, true);
});
onUnmounted(() => {
  if (rebindListener) window.removeEventListener("keydown", rebindListener, true);
});
</script>

<template>
  <div class="pause-overlay" @click.self="emit('close')">
    <div class="pause-card">
      <!-- Main menu -->
      <template v-if="view === 'main'">
        <h1 class="pause-title">Pause</h1>
        <div class="pause-buttons">
          <button
            type="button"
            class="pause-btn pause-btn-resume"
            @click="emit('close')"
          >
            Resume
          </button>
          <button
            type="button"
            class="pause-btn pause-btn-options"
            @click="openOptions"
          >
            Options
          </button>
        </div>
      </template>

      <!-- Options -->
      <template v-else>
        <div class="options-header">
          <button
            type="button"
            class="options-back"
            @click="back"
            aria-label="Back"
          >
            ←
          </button>
          <h1 class="pause-title">Options</h1>
        </div>
        <div class="options-tabs">
          <button
            type="button"
            class="options-tab"
            :class="{ active: optionsTab === 'graphics' }"
            @click="optionsTab = 'graphics'"
          >
            Grafik
          </button>
          <button
            type="button"
            class="options-tab"
            :class="{ active: optionsTab === 'controls' }"
            @click="optionsTab = 'controls'"
          >
            Steuerung
          </button>
        </div>

        <!-- Graphics -->
        <div v-show="optionsTab === 'graphics'" class="options-list">
          <label class="option-row">
            <span class="option-label">Resource pack</span>
            <select
              :value="selectedResourcePack"
              class="option-select"
              @change="onResourcePackChange(($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="opt in packOptions"
                :key="opt.path"
                :value="opt.path"
              >
                {{ opt.name }}
              </option>
            </select>
          </label>
          <p class="option-hint option-hint-inline">
            Changing the pack reloads the game to apply textures.
          </p>
          <label class="option-row">
            <span class="option-label">Sichtweite (Chunks)</span>
            <div class="option-control">
              <input
                v-model.number="renderDistance"
                type="range"
                min="2"
                max="12"
                step="1"
                class="option-slider"
              />
              <span class="option-value">{{ renderDistance }}</span>
            </div>
          </label>
          <label class="option-row">
            <span class="option-label">FOV (normal)</span>
            <div class="option-control">
              <input
                v-model.number="fovNormal"
                type="range"
                min="60"
                max="120"
                step="1"
                class="option-slider"
              />
              <span class="option-value">{{ fovNormal }}°</span>
            </div>
          </label>
          <label class="option-row">
            <span class="option-label">FOV (Sprint)</span>
            <div class="option-control">
              <input
                v-model.number="fovSprint"
                type="range"
                min="60"
                max="120"
                step="1"
                class="option-slider"
              />
              <span class="option-value">{{ fovSprint }}°</span>
            </div>
          </label>
          <label class="option-row">
            <span class="option-label">Maus-Sensitivität</span>
            <div class="option-control">
              <input
                v-model.number="pointerSpeed"
                type="range"
                min="0.1"
                max="3"
                step="0.1"
                class="option-slider"
              />
              <span class="option-value">{{ pointerSpeed.toFixed(1) }}</span>
            </div>
          </label>
          <label class="option-row">
            <span class="option-label">Maus (Sprint)</span>
            <div class="option-control">
              <input
                v-model.number="pointerSpeedSprint"
                type="range"
                min="0.1"
                max="3"
                step="0.1"
                class="option-slider"
              />
              <span class="option-value">{{ pointerSpeedSprint.toFixed(1) }}</span>
            </div>
          </label>
          <label class="option-row option-row-toggle">
            <span class="option-label">Schatten</span>
            <input
              v-model="shadowsEnabled"
              type="checkbox"
              class="option-checkbox"
            />
          </label>
          <label class="option-row option-row-toggle">
            <span class="option-label">Torch shadows</span>
            <input
              v-model="torchShadowsEnabled"
              type="checkbox"
              class="option-checkbox"
            />
          </label>
          <p class="option-hint option-hint-inline">
            Torch shadows may impact performance with many torches.
          </p>
          <label class="option-row">
            <span class="option-label">Schatten-Qualität</span>
            <select v-model.number="shadowMapSize" class="option-select">
              <option
                v-for="opt in shadowMapSizeOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </label>
          <label class="option-row option-row-toggle">
            <span class="option-label">Antialiasing</span>
            <input
              v-model="antialias"
              type="checkbox"
              class="option-checkbox"
            />
          </label>
          <p class="option-hint">
            Antialiasing wirkt erst nach Neustart.
          </p>
        </div>

        <!-- Controls (key bindings) -->
        <div v-show="optionsTab === 'controls'" class="options-list controls-list">
          <p class="option-hint">Klicke auf eine Taste und drücke die neue Belegung.</p>
          <div
            v-for="action in keyActions"
            :key="action"
            class="key-row"
            :class="{ rebinding: rebindingAction === action }"
          >
            <span class="key-label">{{ keyActionLabels[action] }}</span>
            <button
              type="button"
              class="key-btn"
              @click="startRebind(action)"
            >
              {{ rebindingAction === action ? "… drücke Taste …" : codeToDisplayName(keyBindings[action]) }}
            </button>
          </div>
          <button type="button" class="pause-btn pause-btn-reset" @click="resetKeys">
            Tasten auf Standard zurücksetzen
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.pause-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.pause-card {
  background: rgba(20, 25, 40, 0.95);
  border: 2px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: 2rem 2.5rem;
  min-width: 280px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.pause-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 1.5rem 0;
  text-align: center;
}

.pause-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.pause-btn {
  padding: 0.9rem 1.25rem;
  font-size: 1rem;
  font-weight: 600;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

.pause-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
}

.pause-btn-resume {
  background: linear-gradient(180deg, #4a7c59 0%, #3d6b4a 100%);
  color: #fff;
}

.pause-btn-options {
  background: linear-gradient(180deg, #5a5a6a 0%, #4a4a5a 100%);
  color: #fff;
}

.options-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.options-back {
  padding: 0.4rem 0.6rem;
  font-size: 1.25rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  line-height: 1;
}

.options-back:hover {
  background: rgba(255, 255, 255, 0.15);
}

.pause-card .options-header .pause-title {
  margin: 0;
  text-align: left;
  flex: 1;
}

.options-tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
}

.options-tab {
  flex: 1;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.options-tab:hover {
  background: rgba(255, 255, 255, 0.12);
}

.options-tab.active {
  background: rgba(74, 124, 89, 0.4);
  border-color: rgba(74, 124, 89, 0.8);
  color: #fff;
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  color: #e0e0e0;
  font-size: 0.95rem;
}

.option-row-toggle {
  cursor: pointer;
}

.option-label {
  flex-shrink: 0;
}

.option-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 100px;
}

.option-slider {
  width: 100%;
  max-width: 120px;
  accent-color: #4a7c59;
}

.option-value {
  min-width: 1.5rem;
  text-align: right;
  color: #fff;
}

.option-checkbox {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: #4a7c59;
  cursor: pointer;
}

.option-hint {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0.25rem 0 0 0;
}

.option-select {
  padding: 0.35rem 0.5rem;
  font-size: 0.9rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  min-width: 140px;
}

.controls-list {
  max-height: 60vh;
  overflow-y: auto;
}

.key-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.key-row.rebinding .key-btn {
  outline: 2px solid #4a7c59;
  outline-offset: 2px;
}

.key-label {
  font-size: 0.9rem;
  color: #e0e0e0;
  flex-shrink: 0;
}

.key-btn {
  padding: 0.4rem 0.75rem;
  font-size: 0.9rem;
  min-width: 5rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
}

.key-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.pause-btn-reset {
  margin-top: 1rem;
  background: rgba(120, 80, 80, 0.6);
  color: #fff;
}

.pause-btn-reset:hover {
  background: rgba(140, 90, 90, 0.8);
}
</style>

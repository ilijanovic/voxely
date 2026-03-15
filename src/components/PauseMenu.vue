<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
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
  setToneMappingEnabled,
  setToneMappingExposure,
  setShadowMapType,
  setBloomEnabled,
  setBloomStrength,
  setBloomRadius,
  setBloomThreshold,
  type ShadowMapType,
} from '../graphics-settings'
import {
  getKeyBindings,
  setKeyBinding,
  resetKeyBindingsToDefaults,
  keyActionLabels,
  keyActions,
  codeToDisplayName,
  type KeyAction,
} from '../key-settings'
import { applyGraphicsSettings } from '../game'
import {
  getAvailablePacks,
  getSelectedResourcePack,
  setSelectedResourcePack,
  type PackOption,
} from '../resource-pack-settings'

const emit = defineEmits<{ close: [] }>()

const view = ref<'main' | 'options'>('main')
const optionsTab = ref<'graphics' | 'controls'>('graphics')

// Graphics state
const renderDistance = ref(getGraphicsState().renderDistance)
const shadowsEnabled = ref(getGraphicsState().shadowsEnabled)
const torchShadowsEnabled = ref(getGraphicsState().torchShadowsEnabled)
const antialias = ref(getGraphicsState().antialias)
const fovNormal = ref(getGraphicsState().fovNormal)
const fovSprint = ref(getGraphicsState().fovSprint)
const pointerSpeed = ref(getGraphicsState().pointerSpeed)
const pointerSpeedSprint = ref(getGraphicsState().pointerSpeedSprint)
const shadowMapSize = ref(getGraphicsState().shadowMapSize)
const toneMappingEnabled = ref(getGraphicsState().toneMappingEnabled)
const toneMappingExposure = ref(getGraphicsState().toneMappingExposure)
const shadowMapType = ref<ShadowMapType>(getGraphicsState().shadowMapType)
const bloomEnabled = ref(getGraphicsState().bloomEnabled)
const bloomStrength = ref(getGraphicsState().bloomStrength)
const bloomRadius = ref(getGraphicsState().bloomRadius)
const bloomThreshold = ref(getGraphicsState().bloomThreshold)

// Controls: current bindings (reactive for UI)
const keyBindings = ref<Record<KeyAction, string>>(getKeyBindings())
const rebindingAction = ref<KeyAction | null>(null)

/** Syncs graphics refs to graphics-settings and applies them to the renderer; any change to a ref triggers applyGraphicsSettings(). */
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
    toneMappingEnabled,
    toneMappingExposure,
    shadowMapType,
    bloomEnabled,
    bloomStrength,
    bloomRadius,
    bloomThreshold,
  ],
  () => {
    setRenderDistance(renderDistance.value)
    setShadowsEnabled(shadowsEnabled.value)
    setTorchShadowsEnabled(torchShadowsEnabled.value)
    setAntialias(antialias.value)
    setFovNormal(fovNormal.value)
    setFovSprint(fovSprint.value)
    setPointerSpeed(pointerSpeed.value)
    setPointerSpeedSprint(pointerSpeedSprint.value)
    setShadowMapSize(shadowMapSize.value as 512 | 1024 | 2048)
    setToneMappingEnabled(toneMappingEnabled.value)
    setToneMappingExposure(toneMappingExposure.value)
    setShadowMapType(shadowMapType.value)
    setBloomEnabled(bloomEnabled.value)
    setBloomStrength(bloomStrength.value)
    setBloomRadius(bloomRadius.value)
    setBloomThreshold(bloomThreshold.value)
    applyGraphicsSettings()
  },
  { deep: true },
)

/** Switches to options view, loads resource pack list, and syncs all option refs from current graphics/key settings. */
function openOptions() {
  view.value = 'options'
  optionsTab.value = 'graphics'
  loadPackOptions()
  const g = getGraphicsState()
  renderDistance.value = g.renderDistance
  shadowsEnabled.value = g.shadowsEnabled
  torchShadowsEnabled.value = g.torchShadowsEnabled
  antialias.value = g.antialias
  fovNormal.value = g.fovNormal
  fovSprint.value = g.fovSprint
  pointerSpeed.value = g.pointerSpeed
  pointerSpeedSprint.value = g.pointerSpeedSprint
  shadowMapSize.value = g.shadowMapSize
  toneMappingEnabled.value = g.toneMappingEnabled
  toneMappingExposure.value = g.toneMappingExposure
  shadowMapType.value = g.shadowMapType
  bloomEnabled.value = g.bloomEnabled
  bloomStrength.value = g.bloomStrength
  bloomRadius.value = g.bloomRadius
  bloomThreshold.value = g.bloomThreshold
  keyBindings.value = getKeyBindings()
  rebindingAction.value = null
}

/** Returns to main pause view and clears any active key rebind. */
function back() {
  view.value = 'main'
  rebindingAction.value = null
}

/** Enters rebind mode for the given action; next keydown (captured in onRebindKey) will set the binding. */
function startRebind(action: KeyAction) {
  rebindingAction.value = action
}

/** Handles keydown during rebind: sets the binding for rebindingAction and clears rebind mode. Called from a capture-phase listener in onMounted. */
function onRebindKey(e: KeyboardEvent) {
  if (rebindingAction.value == null) return
  e.preventDefault()
  e.stopPropagation()
  setKeyBinding(rebindingAction.value, e.code)
  keyBindings.value = getKeyBindings()
  rebindingAction.value = null
}

/** Restores all key bindings to defaults and refreshes keyBindings ref. */
function resetKeys() {
  resetKeyBindingsToDefaults()
  keyBindings.value = getKeyBindings()
}

const shadowMapSizeOptions = [
  { value: 512, label: '512 (fast)' },
  { value: 1024, label: '1024' },
  { value: 2048, label: '2048 (quality)' },
]

// Resource pack: list loaded async, selection persisted; change triggers reload
const packOptions = ref<PackOption[]>([])
const selectedResourcePack = ref(getSelectedResourcePack())

/** Fetches available resource packs and updates packOptions; also syncs selectedResourcePack from settings. */
function loadPackOptions() {
  getAvailablePacks().then((list) => {
    packOptions.value = list
    selectedResourcePack.value = getSelectedResourcePack()
  })
}

/** Persists the selected pack path and reloads the page so new textures are applied. */
function onResourcePackChange(newPath: string) {
  setSelectedResourcePack(newPath)
  selectedResourcePack.value = newPath
  window.location.reload()
}

let rebindListener: ((e: KeyboardEvent) => void) | null = null
onMounted(() => {
  rebindListener = (e: KeyboardEvent) => {
    if (rebindingAction.value != null) onRebindKey(e)
  }
  window.addEventListener('keydown', rebindListener, true)
})
onUnmounted(() => {
  if (rebindListener) window.removeEventListener('keydown', rebindListener, true)
})
</script>

<template>
  <div class="pause-overlay" @click.self="emit('close')" @wheel.stop>
    <div class="pause-card">
      <!-- Main menu -->
      <template v-if="view === 'main'">
        <h1 class="pause-title">Pause</h1>
        <div class="pause-buttons">
          <button type="button" class="pause-btn pause-btn-resume" @click="emit('close')">
            Resume
          </button>
          <button type="button" class="pause-btn pause-btn-options" @click="openOptions">
            Options
          </button>
        </div>
      </template>

      <!-- Options -->
      <template v-else>
        <div class="options-header">
          <button type="button" class="options-back" @click="back" aria-label="Back">←</button>
          <h1 class="pause-title">Options</h1>
        </div>
        <div class="options-tabs">
          <button
            type="button"
            class="options-tab"
            :class="{ active: optionsTab === 'graphics' }"
            @click="optionsTab = 'graphics'"
          >
            Graphics
          </button>
          <button
            type="button"
            class="options-tab"
            :class="{ active: optionsTab === 'controls' }"
            @click="optionsTab = 'controls'"
          >
            Controls
          </button>
        </div>

        <!-- Graphics -->
        <div v-show="optionsTab === 'graphics'" class="options-list">
          <section class="options-group">
            <h2 class="options-group-title">Display</h2>
            <label class="option-row">
              <span class="option-label">Resource pack</span>
              <select
                :value="selectedResourcePack"
                class="option-select"
                @change="onResourcePackChange(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="opt in packOptions" :key="opt.path" :value="opt.path">
                  {{ opt.name }}
                </option>
              </select>
            </label>
            <p class="option-hint">
              Changing the pack reloads the game to apply textures.
            </p>
            <label class="option-row">
              <span class="option-label">Render distance (chunks)</span>
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
            <label class="option-row option-row-toggle">
              <span class="option-label">Antialiasing</span>
              <span class="option-toggle-wrap">
                <input v-model="antialias" type="checkbox" class="option-toggle-input" />
                <span class="option-toggle-track">
                  <span class="option-toggle-thumb"></span>
                </span>
                <span class="option-toggle-text">{{ antialias ? 'On' : 'Off' }}</span>
              </span>
            </label>
            <p class="option-hint">Antialiasing takes effect after restart.</p>
          </section>

          <section class="options-group">
            <h2 class="options-group-title">Camera & Input</h2>
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
              <span class="option-label">FOV (sprint)</span>
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
              <span class="option-label">Mouse sensitivity</span>
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
              <span class="option-label">Mouse (sprint)</span>
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
          </section>

          <section class="options-group">
            <h2 class="options-group-title">Lighting & Effects</h2>
            <label class="option-row option-row-toggle">
              <span class="option-label">Tone mapping</span>
              <span class="option-toggle-wrap">
                <input v-model="toneMappingEnabled" type="checkbox" class="option-toggle-input" />
                <span class="option-toggle-track">
                  <span class="option-toggle-thumb"></span>
                </span>
                <span class="option-toggle-text">{{ toneMappingEnabled ? 'On' : 'Off' }}</span>
              </span>
            </label>
            <label v-show="toneMappingEnabled" class="option-row">
              <span class="option-label">Exposure</span>
              <div class="option-control">
                <input
                  v-model.number="toneMappingExposure"
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  class="option-slider"
                />
                <span class="option-value">{{ toneMappingExposure.toFixed(1) }}</span>
              </div>
            </label>
            <label class="option-row option-row-toggle">
              <span class="option-label">Shadows</span>
              <span class="option-toggle-wrap">
                <input v-model="shadowsEnabled" type="checkbox" class="option-toggle-input" />
                <span class="option-toggle-track">
                  <span class="option-toggle-thumb"></span>
                </span>
                <span class="option-toggle-text">{{ shadowsEnabled ? 'On' : 'Off' }}</span>
              </span>
            </label>
            <label class="option-row option-row-toggle">
              <span class="option-label">Torch shadows</span>
              <span class="option-toggle-wrap">
                <input v-model="torchShadowsEnabled" type="checkbox" class="option-toggle-input" />
                <span class="option-toggle-track">
                  <span class="option-toggle-thumb"></span>
                </span>
                <span class="option-toggle-text">{{ torchShadowsEnabled ? 'On' : 'Off' }}</span>
              </span>
            </label>
            <p class="option-hint">
              Torch shadows may impact performance with many torches.
            </p>
            <label class="option-row">
              <span class="option-label">Shadow softness</span>
              <select v-model="shadowMapType" class="option-select">
                <option value="pcf">PCF (standard)</option>
                <option value="pcf_soft">PCF Soft</option>
              </select>
            </label>
            <label class="option-row">
              <span class="option-label">Shadow quality</span>
              <select v-model.number="shadowMapSize" class="option-select">
                <option v-for="opt in shadowMapSizeOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </label>
            <label class="option-row option-row-toggle">
              <span class="option-label">Bloom</span>
              <span class="option-toggle-wrap">
                <input v-model="bloomEnabled" type="checkbox" class="option-toggle-input" />
                <span class="option-toggle-track">
                  <span class="option-toggle-thumb"></span>
                </span>
                <span class="option-toggle-text">{{ bloomEnabled ? 'On' : 'Off' }}</span>
              </span>
            </label>
            <template v-show="bloomEnabled">
              <label class="option-row">
                <span class="option-label">Bloom strength</span>
                <div class="option-control">
                  <input
                    v-model.number="bloomStrength"
                    type="range"
                    min="0"
                    max="1.2"
                    step="0.05"
                    class="option-slider"
                  />
                  <span class="option-value">{{ bloomStrength.toFixed(1) }}</span>
                </div>
              </label>
              <label class="option-row">
                <span class="option-label">Bloom radius</span>
                <div class="option-control">
                  <input
                    v-model.number="bloomRadius"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    class="option-slider"
                  />
                  <span class="option-value">{{ bloomRadius.toFixed(2) }}</span>
                </div>
              </label>
              <label class="option-row">
                <span class="option-label">Bloom threshold</span>
                <div class="option-control">
                  <input
                    v-model.number="bloomThreshold"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    class="option-slider"
                  />
                  <span class="option-value">{{ bloomThreshold.toFixed(2) }}</span>
                </div>
              </label>
            </template>
            <p class="option-hint">
              Bloom may impact performance on low-end GPUs.
            </p>
          </section>
        </div>

        <!-- Controls (key bindings) -->
        <div v-show="optionsTab === 'controls'" class="options-list controls-list">
          <section class="options-group">
            <h2 class="options-group-title">Key Bindings</h2>
            <p class="option-hint">Click a key and press the new binding.</p>
            <div
              v-for="action in keyActions"
              :key="action"
              class="key-row"
              :class="{ rebinding: rebindingAction === action }"
            >
              <span class="key-label">{{ keyActionLabels[action] }}</span>
              <button type="button" class="key-btn" @click="startRebind(action)">
                {{
                  rebindingAction === action
                    ? '… press key …'
                    : codeToDisplayName(keyBindings[action])
                }}
              </button>
            </div>
            <button type="button" class="pause-btn pause-btn-reset" @click="resetKeys">
              Reset keys to default
            </button>
          </section>
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
  padding: 1rem;
  background: rgba(2, 6, 14, 0.62);
  backdrop-filter: blur(6px);
}

.pause-card {
  width: min(96vw, 760px);
  max-height: min(88vh, 840px);
  overflow: hidden;
  background: linear-gradient(180deg, rgba(12, 20, 34, 0.97) 0%, rgba(9, 15, 27, 0.97) 100%);
  border: 2px solid rgba(122, 148, 183, 0.28);
  border-radius: var(--ui-radius-lg);
  padding: 1.35rem 1.25rem;
  box-shadow:
    0 26px 70px rgba(0, 0, 0, 0.62),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.pause-title {
  font-size: 1.45rem;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0 0 1rem 0;
  text-align: center;
  letter-spacing: 0.01em;
  font-family: var(--ui-font);
}

.pause-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.pause-btn {
  padding: 0.78rem 1.05rem;
  font-size: 1rem;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--ui-radius-md);
  cursor: pointer;
  transition:
    transform 0.14s ease,
    box-shadow 0.14s ease,
    border-color 0.14s ease;
  font-family: var(--ui-font);
}

.pause-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
}

.pause-btn:focus-visible {
  outline: 2px solid rgba(126, 180, 141, 0.95);
  outline-offset: 2px;
}

.pause-btn-resume {
  background: linear-gradient(180deg, #5b9170 0%, #3f6f53 100%);
  color: var(--ui-text);
}

.pause-btn-options {
  background: linear-gradient(180deg, #55607a 0%, #434f68 100%);
  color: var(--ui-text);
}

.options-header {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-bottom: 0.7rem;
}

.options-back {
  padding: 0.36rem 0.62rem;
  font-size: 1.25rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: var(--ui-radius-md);
  color: var(--ui-text);
  cursor: pointer;
  line-height: 1;
  transition:
    background 0.12s ease,
    border-color 0.12s ease;
}

.options-back:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.35);
}

.options-back:focus-visible {
  outline: 2px solid rgba(126, 180, 141, 0.95);
  outline-offset: 2px;
}

.pause-card .options-header .pause-title {
  margin: 0;
  text-align: left;
  flex: 1;
}

.options-tabs {
  display: flex;
  gap: 0.35rem;
  margin-bottom: 0.85rem;
}

.options-tab {
  flex: 1;
  padding: 0.54rem 0.72rem;
  font-size: 0.9rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--ui-radius-md);
  color: var(--ui-text-muted);
  cursor: pointer;
  transition:
    background 0.14s ease,
    border-color 0.14s ease,
    color 0.14s ease;
  font-family: var(--ui-font);
}

.options-tab:hover {
  background: rgba(255, 255, 255, 0.1);
}

.options-tab:focus-visible {
  outline: 2px solid rgba(126, 180, 141, 0.95);
  outline-offset: 2px;
}

.options-tab.active {
  background: rgba(84, 128, 168, 0.28);
  border-color: rgba(112, 162, 207, 0.65);
  color: var(--ui-text);
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  max-height: min(66vh, 620px);
  overflow-y: auto;
  padding-right: 0.15rem;
}

.options-list::-webkit-scrollbar {
  width: 10px;
}

.options-list::-webkit-scrollbar-thumb {
  background: rgba(158, 178, 205, 0.35);
  border: 2px solid transparent;
  border-radius: 999px;
  background-clip: content-box;
}

.options-group {
  display: flex;
  flex-direction: column;
  gap: 0.58rem;
  padding: 0.78rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--ui-radius-md);
}

.options-group-title {
  margin: 0 0 0.15rem;
  font-size: 0.77rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(225, 240, 255, 0.84);
  font-family: var(--ui-font);
}

.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  color: rgba(232, 240, 252, 0.95);
  font-size: 0.91rem;
  font-family: var(--ui-font);
}

.option-row-toggle {
  cursor: pointer;
}

.option-label {
  flex: 1;
  min-width: 0;
}

.option-control {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.55rem;
  min-width: 180px;
}

.option-slider {
  width: min(220px, 100%);
  accent-color: var(--ui-accent);
}

.option-value {
  min-width: 2.45rem;
  text-align: right;
  color: var(--ui-text);
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
}

.option-toggle-wrap {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  position: relative;
}

.option-toggle-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.option-toggle-track {
  display: inline-flex;
  align-items: center;
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 2px;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.option-toggle-thumb {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: rgba(241, 245, 252, 0.95);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
  transition: transform 0.16s ease;
}

.option-toggle-input:checked + .option-toggle-track {
  background: rgba(79, 142, 97, 0.85);
  border-color: rgba(124, 210, 149, 0.75);
}

.option-toggle-input:checked + .option-toggle-track .option-toggle-thumb {
  transform: translateX(20px);
}

.option-toggle-input:focus-visible + .option-toggle-track {
  outline: 2px solid rgba(126, 180, 141, 0.95);
  outline-offset: 2px;
}

.option-toggle-text {
  min-width: 1.8rem;
  color: var(--ui-text);
  font-size: 0.8rem;
  font-weight: 700;
  text-align: right;
}

.option-hint {
  font-size: 0.75rem;
  line-height: 1.45;
  color: rgba(211, 225, 245, 0.74);
  margin: -0.08rem 0 0 0;
}

.option-select {
  width: min(230px, 100%);
  padding: 0.42rem 0.55rem;
  font-size: 0.86rem;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: var(--ui-radius-sm);
  color: var(--ui-text);
  cursor: pointer;
  min-width: 140px;
  transition:
    border-color 0.14s ease,
    background 0.14s ease;
  font-family: var(--ui-font);
}

.option-select:hover {
  background: rgba(0, 0, 0, 0.4);
  border-color: rgba(255, 255, 255, 0.36);
}

.option-select:focus-visible {
  outline: 2px solid rgba(126, 180, 141, 0.95);
  outline-offset: 2px;
}

.key-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.46rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.key-row.rebinding .key-btn {
  outline: 2px solid rgba(126, 180, 141, 0.95);
  outline-offset: 2px;
}

.key-label {
  font-size: 0.86rem;
  color: #e0e0e0;
  flex-shrink: 0;
  font-family: var(--ui-font);
}

.key-btn {
  padding: 0.4rem 0.7rem;
  font-size: 0.84rem;
  min-width: 5rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: var(--ui-radius-sm);
  color: var(--ui-text);
  cursor: pointer;
  transition:
    background 0.12s ease,
    border-color 0.12s ease;
  font-family: var(--ui-font);
}

.key-btn:hover {
  background: rgba(255, 255, 255, 0.13);
  border-color: rgba(255, 255, 255, 0.3);
}

.key-btn:focus-visible {
  outline: 2px solid rgba(126, 180, 141, 0.95);
  outline-offset: 2px;
}

.pause-btn-reset {
  margin-top: 0.9rem;
  background: rgba(120, 80, 80, 0.6);
  color: #fff;
}

.pause-btn-reset:hover {
  background: rgba(140, 90, 90, 0.8);
}

@media (max-width: 720px) {
  .pause-card {
    width: 96vw;
    padding: 1rem 0.9rem;
  }

  .option-row {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .option-label {
    width: 100%;
  }

  .option-control {
    width: 100%;
    justify-content: space-between;
    min-width: 0;
  }

  .option-slider {
    width: calc(100% - 3rem);
  }

  .option-select {
    width: 100%;
  }
}
</style>

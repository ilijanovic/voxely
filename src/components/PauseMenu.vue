<script setup lang="ts">
import { ref, watch } from "vue";
import {
  getGraphicsState,
  setRenderDistance,
  setShadowsEnabled,
  setAntialias,
} from "../graphics-settings";
import { applyGraphicsSettings } from "../game";

const emit = defineEmits<{ close: [] }>();

const view = ref<"main" | "options">("main");
const renderDistance = ref(getGraphicsState().renderDistance);
const shadowsEnabled = ref(getGraphicsState().shadowsEnabled);
const antialias = ref(getGraphicsState().antialias);

watch(
  [renderDistance, shadowsEnabled, antialias],
  () => {
    setRenderDistance(renderDistance.value);
    setShadowsEnabled(shadowsEnabled.value);
    setAntialias(antialias.value);
    applyGraphicsSettings();
  },
  { deep: true }
);

function openOptions() {
  view.value = "options";
  renderDistance.value = getGraphicsState().renderDistance;
  shadowsEnabled.value = getGraphicsState().shadowsEnabled;
  antialias.value = getGraphicsState().antialias;
}

function back() {
  view.value = "main";
}
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

      <!-- Options (Graphics) -->
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
          <h1 class="pause-title">Options · Graphics</h1>
        </div>
        <div class="options-list">
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
            <span class="option-label">Shadows</span>
            <input
              v-model="shadowsEnabled"
              type="checkbox"
              class="option-checkbox"
            />
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
            Antialiasing takes effect after restarting the game.
          </p>
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
</style>

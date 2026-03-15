<script setup lang="ts">
import { computed } from 'vue'
import type { WorldSlotMeta } from '../save'

const props = defineProps<{
  worlds: WorldSlotMeta[]
  selectedWorldId: string | null
  onSelectWorld: (worldId: string) => void
  onCreateWorld: () => void
  onSingleplayer: () => void
  onMultiplayer: () => void
}>()

/** Selected world metadata for the right-side action panel. */
const selectedWorld = computed(() => {
  if (!props.selectedWorldId) return props.worlds[0] ?? null
  return props.worlds.find((world) => world.id === props.selectedWorldId) ?? props.worlds[0] ?? null
})

/**
 * Formats a timestamp as a short locale date/time label.
 *
 * @param epochMs - Unix timestamp in milliseconds
 * @returns User-friendly date label
 */
function formatWorldTime(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return 'Unknown'
  return new Date(epochMs).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="menu-overlay">
    <div class="menu-glow menu-glow-a"></div>
    <div class="menu-glow menu-glow-b"></div>

    <div class="menu-shell">
      <header class="menu-header">
        <h1 class="menu-title">Voxely</h1>
        <p class="menu-subtitle">Pick a world and jump back in.</p>
      </header>

      <div class="menu-grid">
        <section class="worlds-card">
          <div class="worlds-header">
            <h2 class="worlds-title">Worlds</h2>
            <button type="button" class="new-world-btn" @click="onCreateWorld">+ New</button>
          </div>

          <div class="world-list">
            <button
              v-for="world in worlds"
              :key="world.id"
              type="button"
              class="world-row"
              :class="{ selected: selectedWorld?.id === world.id }"
              @click="onSelectWorld(world.id)"
            >
              <span class="world-name">{{ world.name }}</span>
              <span class="world-meta">
                {{
                  world.hasSave ? `Last played ${formatWorldTime(world.updatedAt)}` : 'Fresh world'
                }}
              </span>
            </button>
          </div>
        </section>

        <section class="play-card">
          <h2 class="play-world-name">{{ selectedWorld?.name ?? 'No world selected' }}</h2>
          <p class="play-world-subtitle">
            {{
              selectedWorld?.hasSave
                ? 'Continue your adventure where you left off.'
                : 'Start a brand new journey.'
            }}
          </p>

          <div class="menu-buttons">
            <button type="button" class="menu-btn menu-btn-single" @click="onSingleplayer">
              Continue Singleplayer
            </button>
            <button type="button" class="menu-btn menu-btn-multi" @click="onMultiplayer">
              Enter Multiplayer
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.2rem;
  overflow: hidden;
  background:
    radial-gradient(circle at 14% 18%, rgba(80, 151, 119, 0.28), transparent 42%),
    radial-gradient(circle at 82% 8%, rgba(84, 128, 191, 0.3), transparent 40%),
    linear-gradient(165deg, #070c16 0%, #0b1a2c 45%, #101e35 100%);
}

.menu-glow {
  position: absolute;
  border-radius: 999px;
  filter: blur(70px);
  opacity: 0.45;
  pointer-events: none;
}

.menu-glow-a {
  width: 260px;
  height: 260px;
  left: -40px;
  top: 10%;
  background: rgba(95, 173, 129, 0.55);
}

.menu-glow-b {
  width: 280px;
  height: 280px;
  right: -70px;
  bottom: -10px;
  background: rgba(96, 139, 199, 0.55);
}

.menu-shell {
  position: relative;
  width: min(980px, 96vw);
  border-radius: 18px;
  border: 1px solid rgba(196, 217, 245, 0.24);
  background: linear-gradient(180deg, rgba(8, 15, 26, 0.94) 0%, rgba(9, 18, 33, 0.94) 100%);
  box-shadow:
    0 30px 70px rgba(0, 0, 0, 0.58),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  padding: 1.1rem;
  backdrop-filter: blur(8px);
}

.menu-header {
  padding: 0.6rem 0.8rem 1rem;
}

.menu-title {
  margin: 0;
  font-size: clamp(1.6rem, 2vw, 2rem);
  letter-spacing: 0.02em;
  color: var(--ui-text);
  font-family: var(--ui-font);
}

.menu-subtitle {
  margin: 0.25rem 0 0;
  color: var(--ui-text-muted);
  font-family: var(--ui-font);
}

.menu-grid {
  display: grid;
  grid-template-columns: 1fr 1.1fr;
  gap: 0.9rem;
}

.worlds-card,
.play-card {
  border-radius: 14px;
  border: 1px solid rgba(189, 209, 237, 0.2);
  background: rgba(12, 21, 37, 0.76);
  padding: 0.9rem;
}

.worlds-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.7rem;
}

.worlds-title {
  margin: 0;
  font-size: 0.95rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(220, 236, 255, 0.86);
  font-family: var(--ui-font);
}

.new-world-btn {
  border: 1px solid rgba(137, 179, 225, 0.38);
  background: rgba(47, 88, 133, 0.48);
  color: var(--ui-text);
  border-radius: 9px;
  padding: 0.4rem 0.65rem;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s ease,
    transform 0.15s ease,
    border-color 0.15s ease;
  font-family: var(--ui-font);
}

.new-world-btn:hover {
  transform: translateY(-1px);
  background: rgba(58, 101, 149, 0.62);
  border-color: rgba(170, 211, 255, 0.55);
}

.new-world-btn:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.world-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 360px;
  overflow-y: auto;
  padding-right: 0.15rem;
}

.world-row {
  width: 100%;
  text-align: left;
  border: 1px solid rgba(193, 214, 240, 0.2);
  border-radius: 11px;
  background: rgba(16, 28, 45, 0.76);
  padding: 0.58rem 0.66rem;
  color: var(--ui-text);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.16rem;
  transition:
    border-color 0.14s ease,
    background 0.14s ease,
    transform 0.14s ease;
  font-family: var(--ui-font);
}

.world-row:hover {
  transform: translateY(-1px);
  border-color: rgba(176, 211, 250, 0.5);
  background: rgba(22, 37, 58, 0.86);
}

.world-row.selected {
  border-color: rgba(112, 194, 143, 0.65);
  background: rgba(26, 49, 53, 0.8);
  box-shadow: inset 0 0 0 1px rgba(112, 194, 143, 0.32);
}

.world-row:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.world-name {
  font-size: 0.95rem;
  font-weight: 700;
}

.world-meta {
  color: rgba(220, 232, 249, 0.74);
  font-size: 0.77rem;
}

.play-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 320px;
}

.play-world-name {
  margin: 0;
  color: #eaf4ff;
  font-size: clamp(1.2rem, 2vw, 1.55rem);
  font-family: var(--ui-font);
}

.play-world-subtitle {
  margin: 0.35rem 0 1rem;
  color: rgba(216, 231, 250, 0.76);
  font-family: var(--ui-font);
}

.menu-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.menu-btn {
  padding: 0.82rem 1rem;
  font-size: 0.95rem;
  font-weight: 700;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition:
    transform 0.14s ease,
    box-shadow 0.14s ease,
    border-color 0.14s ease;
  font-family: var(--ui-font);
}

.menu-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--ui-shadow-button);
}

.menu-btn:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.menu-btn-single {
  border-color: rgba(135, 208, 162, 0.44);
  background: linear-gradient(180deg, rgba(87, 146, 114, 0.98) 0%, rgba(57, 106, 78, 0.98) 100%);
  color: var(--ui-text);
}

.menu-btn-multi {
  border-color: rgba(147, 184, 228, 0.4);
  background: linear-gradient(180deg, rgba(79, 126, 186, 0.98) 0%, rgba(58, 91, 139, 0.98) 100%);
  color: var(--ui-text);
}

@media (max-width: 860px) {
  .menu-shell {
    padding: 0.85rem;
  }

  .menu-grid {
    grid-template-columns: 1fr;
  }

  .world-list {
    max-height: 230px;
  }

  .play-card {
    min-height: 0;
  }
}
</style>

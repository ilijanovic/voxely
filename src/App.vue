<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { initGame } from './game.ts'
import { subscribeConnection, type ConnectionStatus } from './multiplayer'
import type { BlockType } from './types'
import { BLOCK_ICON, BLOCK_LABEL } from './hotbar-icons'

/** 1x1 grey data URL when block icon fails to load (e.g. missing texture path). */
const FALLBACK_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="%23888"/></svg>',
  )
import Inventory from './components/Inventory.vue'
import Chat from './components/Chat.vue'
import Menu from './components/Menu.vue'
import PauseMenu from './components/PauseMenu.vue'

/** null = menu is shown; otherwise game is running (singleplayer or multiplayer). */
const gameMode = ref<null | 'singleplayer' | 'multiplayer'>(null)
const canvasContainer = ref<HTMLElement | null>(null)
const inventoryOpen = ref(false)
const chatOpen = ref(false)
const pauseMenuOpen = ref(false)
const connectionStatus = ref<ConnectionStatus>({ connected: false, playerCount: 0 })
const hintVisible = ref(true)

/** Toggles inventory overlay; exits pointer lock when opening so user can interact with UI. */
function toggleInventory() {
  const willOpen = !inventoryOpen.value
  if (willOpen) {
    document.exitPointerLock()
  }
  inventoryOpen.value = willOpen
}

/** Hides the controls hint when the user first presses WASD. */
function hideHintOnFirstMove(e: KeyboardEvent) {
  if (gameMode.value === null) return
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code))   hintVisible.value = false
}

/** Global key handler: I = inventory, O = pause menu, Escape = close overlay or open pause. Skips when chat has focus. */
function onKeyDown(e: KeyboardEvent) {
  hideHintOnFirstMove(e)
  if (e.code === 'KeyI') {
    if (chatOpen.value) return
    e.preventDefault()
    e.stopPropagation()
    toggleInventory()
    return
  }
  if (e.code === 'KeyO') {
    if (chatOpen.value) return
    if (gameMode.value !== null) {
      e.preventDefault()
      e.stopPropagation()
      if (!pauseMenuOpen.value) {
        document.exitPointerLock()
        pauseMenuOpen.value = true
      }
    }
    return
  }
  if (e.code === 'Escape') {
    if (chatOpen.value) return
    if (inventoryOpen.value) {
      e.preventDefault()
      e.stopPropagation()
      inventoryOpen.value = false
      return
    }
    if (gameMode.value !== null) {
      e.preventDefault()
      e.stopPropagation()
      if (pauseMenuOpen.value) {
        pauseMenuOpen.value = false
      } else {
        document.exitPointerLock()
        pauseMenuOpen.value = true
      }
    }
  }
}

/** Hotbar state from the game (updated via callback when picking up items). */
const hotbarState = ref<{ blocks: BlockType[]; counts: number[] }>({
  blocks: [],
  counts: [],
})

/** Called by game when hotbar selection or slot counts change; keeps hotbarState in sync for HUD and Inventory. */
function onHotbarChange(blocks: BlockType[], counts: number[]) {
  hotbarState.value = { blocks: [...blocks], counts: [...counts] }
}

let unsubscribeConnection: (() => void) | null = null

watch(gameMode, async (mode) => {
  if (!mode) return
  await nextTick()
  const opts = {
    multiplayer: mode === 'multiplayer',
    onHotbarChange,
  }
  if (canvasContainer.value) {
    initGame(canvasContainer.value, opts)
  } else {
    initGame(undefined, opts)
  }
  unsubscribeConnection = subscribeConnection((status) => {
    connectionStatus.value = status
  })
})

let hintTimeout: ReturnType<typeof setTimeout> | null = null
onMounted(() => {
  document.addEventListener('keydown', onKeyDown, true)
  hintTimeout = setTimeout(() => {
    hintVisible.value = false
  }, 8000)
})
onUnmounted(() => {
  if (hintTimeout) clearTimeout(hintTimeout)
  unsubscribeConnection?.()
  document.removeEventListener('keydown', onKeyDown, true)
})
</script>

<template>
  <div class="relative block h-full w-full">
    <!-- Menü: Singleplayer / Multiplayer -->
    <Menu
      v-if="gameMode === null"
      :on-singleplayer="() => (gameMode = 'singleplayer')"
      :on-multiplayer="() => (gameMode = 'multiplayer')"
    />

    <!-- Game (after mode selection) -->
    <template v-else>
      <!-- FPS (top right) -->
      <div
        id="fps"
        aria-hidden="true"
        class="hud-panel fixed right-3 top-3 z-10 rounded-[var(--ui-radius-md)] border-2 px-2 py-1 font-mono text-xs text-[var(--ui-text)] pointer-events-none"
        style="font-family: var(--ui-font)"
      >
        0 FPS
      </div>

      <!-- Multiplayer status (below FPS, left) -->
      <div
        class="fixed left-3 top-12 z-10 rounded-[var(--ui-radius-md)] border-2 px-2.5 py-1.5 text-xs pointer-events-none"
        :class="
          connectionStatus.connected
            ? 'bg-green-900/70 text-green-200 border-green-700/50'
            : 'bg-red-900/60 text-red-200 border-red-700/50'
        "
        style="font-family: var(--ui-font)"
      >
        {{
          connectionStatus.connected
            ? `Multiplayer: ${connectionStatus.playerCount} players`
            : 'Multiplayer: disconnected (start server?)'
        }}
      </div>

      <!-- Hint (auto-hide after 8s or first WASD) -->
      <Transition name="hint-fade">
        <div
          v-show="hintVisible"
          id="hint"
          class="hud-panel fixed left-1/2 top-6 z-10 -translate-x-1/2 rounded-[var(--ui-radius-lg)] border-2 px-4 py-2 text-sm text-[var(--ui-text)] pointer-events-none"
          style="font-family: var(--ui-font)"
        >
          Click to start · WASD = Move · Space = Jump · Mouse = Look · V = Third-person · T = Chat ·
          1–9 / Scroll = Block · ESC / O = Pause / Options
        </div>
      </Transition>

      <!-- Inventory button -->
      <button
        type="button"
        class="hud-panel fixed right-4 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-[var(--ui-radius-md)] border-2 text-[var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-accent)] focus:ring-offset-2 focus:ring-offset-transparent"
        aria-label="Open inventory (I)"
        title="Inventory (I)"
        @click="toggleInventory"
      >
        <svg
          class="h-5 w-5 opacity-90"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M4 6h16v12H4V6zm2 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
          />
        </svg>
      </button>

      <!-- Crosshair (subtle) -->
      <div
        id="crosshair"
        aria-hidden="true"
        class="crosshair fixed left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      >
        <span class="crosshair-v"></span>
        <span class="crosshair-h"></span>
      </div>

      <!-- Block crack overlay (stages 0–9 while mining) -->
      <div id="block-crack" aria-hidden="true" class="block-crack-overlay" />

      <!-- Hotbar: icons + count, .selected is set by the game -->
      <div
        id="hotbar"
        role="toolbar"
        aria-label="Block inventory"
        class="hud-panel fixed bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-[var(--ui-radius-md)] border-[3px] p-1.5 pointer-events-none"
      >
        <div
          v-for="i in 9"
          :key="i - 1"
          class="slot hud-slot relative flex h-12 w-12 shrink-0 items-center justify-center border-2 overflow-hidden transition-[border-color,box-shadow] duration-100"
          :data-slot="i - 1"
          :title="hotbarState.blocks[i - 1] ? BLOCK_LABEL[hotbarState.blocks[i - 1]] : `Slot ${i}`"
        >
          <span
            class="slot-number absolute left-0.5 top-0.5 z-10 text-[9px] text-white/80 drop-shadow-[0_0_1px_#000]"
          >
            {{ i }}
          </span>
          <img
            v-if="hotbarState.blocks[i - 1]"
            :src="BLOCK_ICON[hotbarState.blocks[i - 1]]"
            :alt="BLOCK_LABEL[hotbarState.blocks[i - 1]]"
            class="h-full w-full object-cover object-center"
            @error="(e: Event) => ((e.target as HTMLImageElement).src = FALLBACK_ICON)"
          />
          <span
            v-if="hotbarState.blocks[i - 1] && hotbarState.counts[i - 1] > 1"
            class="absolute bottom-0 right-0.5 z-10 text-[10px] font-bold leading-tight text-white drop-shadow-[0_0_1px_#000]"
          >
            {{ hotbarState.counts[i - 1] }}
          </span>
        </div>
      </div>

      <!-- Inventory overlay: pass hotbar state for icons -->
      <Transition name="modal">
        <Inventory
          v-if="inventoryOpen"
          :hotbar-blocks="hotbarState.blocks"
          :hotbar-counts="hotbarState.counts"
          @close="inventoryOpen = false"
        />
      </Transition>

      <!-- Pause menu (ESC): Resume, Options · Graphics -->
      <Transition name="modal">
        <PauseMenu v-if="pauseMenuOpen" @close="pauseMenuOpen = false" />
      </Transition>

      <!-- Chat: join/leave messages + chat (T/Enter to open) -->
      <Chat @open="chatOpen = true" @close="chatOpen = false" />

      <div ref="canvasContainer" class="absolute inset-0 h-full w-full"></div>
    </template>
  </div>
</template>

<style scoped>
.crosshair {
  width: 20px;
  height: 20px;
}
.crosshair-v,
.crosshair-h {
  position: absolute;
  background: rgba(255, 255, 255, 0.75);
  box-shadow: 0 0 1px #000;
}
.crosshair-v {
  left: 50%;
  top: 0;
  width: 2px;
  height: 100%;
  transform: translateX(-50%);
}
.crosshair-h {
  top: 50%;
  left: 0;
  width: 100%;
  height: 2px;
  transform: translateY(-50%);
}

.hint-fade-enter-active,
.hint-fade-leave-active {
  transition: opacity 0.4s ease;
}
.hint-fade-enter-from,
.hint-fade-leave-to {
  opacity: 0;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* Block crack overlay: centered like crosshair, 10 stages via sprite */
.block-crack-overlay {
  position: fixed;
  left: 50%;
  top: 50%;
  width: 80px;
  height: 80px;
  margin-left: -40px;
  margin-top: -40px;
  z-index: 10;
  pointer-events: none;
  visibility: hidden;
  background-image: url('/crack_stages.svg');
  background-repeat: no-repeat;
  background-position: 0 0;
  background-size: 100% 1000%;
}
</style>

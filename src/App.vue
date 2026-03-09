<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick } from "vue";
import { initGame } from "./game.ts";
import { subscribeConnection, type ConnectionStatus } from "./multiplayer";
import type { BlockType } from "./types";
import { BLOCK_ICON, BLOCK_LABEL } from "./hotbar-icons";

/** 1x1 grey data URL when block icon fails to load (e.g. missing texture path). */
const FALLBACK_ICON =
  "data:image/svg+xml," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="%23888"/></svg>');
import Inventory from "./components/Inventory.vue";
import Chat from "./components/Chat.vue";
import Menu from "./components/Menu.vue";
import PauseMenu from "./components/PauseMenu.vue";

/** null = menu is shown; otherwise game is running (singleplayer or multiplayer). */
const gameMode = ref<null | "singleplayer" | "multiplayer">(null);
const canvasContainer = ref<HTMLElement | null>(null);
const inventoryOpen = ref(false);
const chatOpen = ref(false);
const pauseMenuOpen = ref(false);
const connectionStatus = ref<ConnectionStatus>({ connected: false, playerCount: 0 });

function toggleInventory() {
  const willOpen = !inventoryOpen.value;
  if (willOpen) {
    document.exitPointerLock();
  }
  inventoryOpen.value = willOpen;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.code === "KeyI") {
    if (chatOpen.value) return;
    e.preventDefault();
    e.stopPropagation();
    toggleInventory();
    return;
  }
  if (e.code === "KeyO") {
    if (chatOpen.value) return;
    if (gameMode.value !== null) {
      e.preventDefault();
      e.stopPropagation();
      if (!pauseMenuOpen.value) {
        document.exitPointerLock();
        pauseMenuOpen.value = true;
      }
    }
    return;
  }
  if (e.code === "Escape") {
    if (chatOpen.value) return;
    if (inventoryOpen.value) {
      e.preventDefault();
      e.stopPropagation();
      inventoryOpen.value = false;
      return;
    }
    if (gameMode.value !== null) {
      e.preventDefault();
      e.stopPropagation();
      if (pauseMenuOpen.value) {
        pauseMenuOpen.value = false;
      } else {
        document.exitPointerLock();
        pauseMenuOpen.value = true;
      }
    }
  }
}

/** Hotbar state from the game (updated via callback when picking up items). */
const hotbarState = ref<{ blocks: BlockType[]; counts: number[] }>({
  blocks: [],
  counts: [],
});

function onHotbarChange(blocks: BlockType[], counts: number[]) {
  hotbarState.value = { blocks: [...blocks], counts: [...counts] };
}

let unsubscribeConnection: (() => void) | null = null;

watch(gameMode, async (mode) => {
  if (!mode) return;
  await nextTick();
  const opts = {
    multiplayer: mode === "multiplayer",
    onHotbarChange,
  };
  if (canvasContainer.value) {
    initGame(canvasContainer.value, opts);
  } else {
    initGame(undefined, opts);
  }
  unsubscribeConnection = subscribeConnection((status) => {
    connectionStatus.value = status;
  });
});

onMounted(() => {
  document.addEventListener("keydown", onKeyDown, true);
});
onUnmounted(() => {
  unsubscribeConnection?.();
  document.removeEventListener("keydown", onKeyDown, true);
});
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
    <!-- FPS -->
    <div
      id="fps"
      aria-hidden="true"
      class="fixed left-3 top-3 z-10 rounded-md bg-black/60 px-2.5 py-1.5 font-mono text-sm text-white pointer-events-none"
    >
      0 FPS
    </div>

    <!-- Multiplayer status (below FPS, left) -->
    <div
      class="fixed left-3 top-12 z-10 rounded-md px-2.5 py-1.5 font-mono text-xs pointer-events-none"
      :class="connectionStatus.connected ? 'bg-green-900/70 text-green-200' : 'bg-red-900/60 text-red-200'"
    >
      {{ connectionStatus.connected ? `Multiplayer: ${connectionStatus.playerCount} players` : "Multiplayer: disconnected (start server?)" }}
    </div>

    <!-- Hint -->
    <div
      id="hint"
      class="fixed left-1/2 top-6 z-10 -translate-x-1/2 rounded-lg bg-black/60 px-4 py-2 font-sans text-sm text-white pointer-events-none"
    >
      Click to start · WASD = Move · Space = Jump · Mouse = Look · V = Third-person · T = Chat · 1–9 / Scroll = Block · ESC / O = Pause / Options
    </div>

    <!-- Inventory button -->
    <button
      type="button"
      class="fixed right-4 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-md border-2 border-[#4a4a4a] bg-black/70 font-bold text-white shadow hover:bg-black/90 hover:border-[#5a5a5a] focus:outline-none focus:ring-2 focus:ring-white/50"
      aria-label="Open inventory (I)"
      title="Inventory (I)"
      @click="toggleInventory"
    >
      I
    </button>

    <!-- Crosshair -->
    <div
      id="crosshair"
      aria-hidden="true"
      class="fixed left-1/2 top-1/2 z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-center text-2xl font-bold leading-none text-white pointer-events-none [text-shadow:0_0_2px_#000,0_0_4px_#000]"
    >
      +
    </div>

    <!-- Block crack overlay (stages 0–9 while mining) -->
    <div
      id="block-crack"
      aria-hidden="true"
      class="block-crack-overlay"
    />

    <!-- Hotbar: icons + count, .selected is set by the game -->
    <div
      id="hotbar"
      role="toolbar"
      aria-label="Block inventory"
      class="fixed bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded border-[3px] border-[#4a4a4a] bg-black/70 p-1.5 shadow-[0_0_0_2px_#2a2a2a,inset_0_1px_0_rgba(255,255,255,0.08)] pointer-events-none"
    >
      <div
        v-for="i in 9"
        :key="i - 1"
        class="slot relative flex h-12 w-12 shrink-0 items-center justify-center rounded border-2 border-[#3a3a3a] bg-[rgba(50,50,50,0.9)] overflow-hidden transition-[border-color,box-shadow] duration-100"
        :data-slot="i - 1"
        :title="hotbarState.blocks[i - 1] ? BLOCK_LABEL[hotbarState.blocks[i - 1]] : `Slot ${i}`"
      >
        <span class="slot-number absolute left-0.5 top-0.5 z-10 text-[9px] text-white/80 drop-shadow-[0_0_1px_#000]">
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
    <Inventory
      v-if="inventoryOpen"
      :hotbar-blocks="hotbarState.blocks"
      :hotbar-counts="hotbarState.counts"
      @close="inventoryOpen = false"
    />

    <!-- Pause menu (ESC): Resume, Options · Graphics -->
    <PauseMenu v-if="pauseMenuOpen" @close="pauseMenuOpen = false" />

    <!-- Chat: join/leave messages + chat (T/Enter to open) -->
    <Chat @open="chatOpen = true" @close="chatOpen = false" />

    <div ref="canvasContainer" class="absolute inset-0 h-full w-full"></div>
    </template>
  </div>
</template>

<style scoped>
#hotbar .slot.selected {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5), inset 0 0 12px rgba(255, 255, 255, 0.15);
}

/* Block-Riss-Overlay: zentriert wie Fadenkreuz, 10 Stufen via Sprite */
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
  background-image: url("/crack_stages.svg");
  background-repeat: no-repeat;
  background-position: 0 0;
  background-size: 100% 1000%;
}
</style>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import {
  initGame,
  setBlockCrackElement,
  getPlayerLevel,
  getPlayerExperience,
  getPlayerHealth,
  getPlayerMaxHealth,
  getPlayerHunger,
  getPlayerMaxHunger,
  getPlayerFaction,
  getPlayerClass,
  getPlayerYaw,
  getEquipped,
  getSkillCooldownRemaining,
  claimQuestReward,
  refreshQuestCollectObjectives,
} from './game.ts'
import { getFactionDisplayName, getClassDisplayName } from './player/faction'
import { getFirstSkillForClass } from './player/skills'
import {
  tryEquipFromInventory,
  tryUnequipToInventory,
  canEquip,
  setOnEquipmentChange,
} from './equipment'
import type { EquipmentSlot } from './player/faction'
import { EQUIPMENT_SLOTS } from './player/faction'
import {
  getActiveQuests,
  getAvailableQuestIds,
  getCompletedQuestIds,
  acceptQuest,
  abortQuest,
} from './quests/quest-state'
import { getQuestById } from './quests/quest-registry'
import { getLevelProgress } from './experience'
import { getGold, setOnGoldChange } from './gold'
import { MAX_LEVEL, LEVEL_UP_DISPLAY_MS } from './constants'
import { getKeyBinding } from './key-settings'
import { subscribeConnection } from './multiplayer'
import type { ConnectionStatus } from './multiplayer/types'
import type { BlockType } from './types'
import { BLOCK_ICON, BLOCK_LABEL } from './hotbar-icons'
import {
  getAllSlots,
  getHotbarSlots,
  getCraftingTableSlots,
  setOnInventoryChange,
  moveSlots,
  craftOne,
  craftOne3x3,
  clearCraftingGrid,
  returnCraftingGridToInventory,
  returnCraftingTableToInventory,
  moveToCraftingTable,
  moveFromCraftingTable,
  moveWithinCraftingTable,
} from './inventory'

/** 1x1 grey data URL when block icon fails to load (e.g. missing texture path). */
const FALLBACK_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="%23888"/></svg>',
  )
import Inventory from './components/Inventory.vue'
import CraftingTable from './components/CraftingTable.vue'
import Chat from './components/Chat.vue'
import Menu from './components/Menu.vue'
import PauseMenu from './components/PauseMenu.vue'
import QuestLog from './components/QuestLog.vue'
import FullMap from './components/FullMap.vue'

/** null = menu is shown; otherwise game is running (singleplayer or multiplayer). */
const gameMode = ref<null | 'singleplayer' | 'multiplayer'>(null)
const canvasContainer = ref<HTMLElement | null>(null)
const inventoryOpen = ref(false)
const craftingTableOpen = ref(false)
const chatOpen = ref(false)
const pauseMenuOpen = ref(false)
const questLogOpen = ref(false)
/** When opening quest log from a quest NPC, preselect this quest id (first turn-in or first available). */
const questLogInitialSelectedId = ref<string | null>(null)
/** True when the log was opened by interacting with a quest giver (player can turn in here). */
const questLogAtQuestGiver = ref(false)
/** When set, quest log shows only this NPC's offered quests; when null (e.g. opened with Q), personal list only. */
const questLogOfferedIds = ref<string[] | null>(null)
const mapOpen = ref(false)
const connectionStatus = ref<ConnectionStatus>({ connected: false, playerCount: 0 })
const hintVisible = ref(true)

/** Toggles inventory overlay; exits pointer lock when opening so user can interact with UI. */
function toggleInventory() {
  const willOpen = !inventoryOpen.value
  if (willOpen) {
    document.exitPointerLock()
  } else {
    returnCraftingGridToInventory()
  }
  inventoryOpen.value = willOpen
}

/** Closes inventory overlay and returns crafting grid items to inventory. */
function closeInventory() {
  returnCraftingGridToInventory()
  inventoryOpen.value = false
}

/** Opens the crafting table overlay (3×3 grid). Called when right-clicking a crafting table block. */
function openCraftingTableMenu() {
  document.exitPointerLock()
  craftingTableSlots.value = getCraftingTableSlots()
  craftingTableOpen.value = true
}

/** Closes crafting table overlay and returns 3×3 grid items to inventory. */
function closeCraftingTable() {
  returnCraftingTableToInventory()
  craftingTableOpen.value = false
}

/**
 * Handles move for the crafting table UI. Virtual indices: 0–35 = inventory, 36–44 = table (3×3).
 */
function handleCraftingTableMove(fromIndex: number, toIndex: number, amount?: number) {
  const TABLE_START = 36
  const invEnd = 35
  if (fromIndex >= 0 && fromIndex <= invEnd && toIndex >= 0 && toIndex <= invEnd) {
    moveSlots(fromIndex, toIndex, amount)
  } else if (fromIndex >= 0 && fromIndex <= invEnd && toIndex >= TABLE_START && toIndex <= TABLE_START + 8) {
    moveToCraftingTable(fromIndex, toIndex - TABLE_START, amount)
  } else if (fromIndex >= TABLE_START && fromIndex <= TABLE_START + 8 && toIndex >= 0 && toIndex <= invEnd) {
    moveFromCraftingTable(fromIndex - TABLE_START, toIndex, amount)
  } else if (fromIndex >= TABLE_START && fromIndex <= TABLE_START + 8 && toIndex >= TABLE_START && toIndex <= TABLE_START + 8) {
    moveWithinCraftingTable(fromIndex - TABLE_START, toIndex - TABLE_START, amount)
  }
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
  if (e.code === 'KeyQ') {
    if (chatOpen.value) return
    if (gameMode.value !== null) {
      e.preventDefault()
      e.stopPropagation()
      if (!questLogOpen.value) {
        document.exitPointerLock()
        refreshQuestList()
        questLogInitialSelectedId.value = null
        questLogAtQuestGiver.value = false
        questLogOfferedIds.value = null
        questLogOpen.value = true
      }
    }
    return
  }
  if (e.code === getKeyBinding('openMap')) {
    if (chatOpen.value) return
    if (gameMode.value !== null) {
      e.preventDefault()
      e.stopPropagation()
      const willOpen = !mapOpen.value
      if (willOpen) document.exitPointerLock()
      mapOpen.value = willOpen
    }
    return
  }
  if (e.code === 'Escape') {
    if (chatOpen.value) return
    if (mapOpen.value) {
      e.preventDefault()
      e.stopPropagation()
      mapOpen.value = false
      return
    }
    if (craftingTableOpen.value) {
      e.preventDefault()
      e.stopPropagation()
      closeCraftingTable()
      return
    }
    if (inventoryOpen.value) {
      e.preventDefault()
      e.stopPropagation()
      closeInventory()
      return
    }
    if (questLogOpen.value) {
      e.preventDefault()
      e.stopPropagation()
      questLogOpen.value = false
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

/** Hotbar state for HUD (blocks and counts for slots 0–8). */
const hotbarState = ref<{ blocks: BlockType[]; counts: number[] }>({
  blocks: [],
  counts: [],
})

/** Full inventory slots (0–39) for Inventory overlay. */
const inventorySlots = ref<Array<{ type: BlockType | null; count: number }>>([])

/** Equipment slots (helm, chest, legs, boots, mainHand, offHand) for Inventory overlay. */
const equipmentSlotsRef = ref<Record<EquipmentSlot, { type: BlockType | null; count: number }>>(
  Object.fromEntries(EQUIPMENT_SLOTS.map((s) => [s, { type: null, count: 0 }])) as Record<
    EquipmentSlot,
    { type: BlockType | null; count: number }
  >,
)

/** 3×3 crafting table grid slots for CraftingTable overlay. */
const craftingTableSlots = ref<Array<{ type: BlockType | null; count: number }>>([])

/** Level and XP for HUD (polled while game is active). */
const playerLevelRef = ref(1)
const xpProgressRef = ref(0)
/** Health and hunger for HUD (polled while game is active). */
const playerHealthRef = ref(20)
const playerMaxHealthRef = ref(20)
const playerHungerRef = ref(20)
const playerMaxHungerRef = ref(20)
/** Gold for HUD (updated via callback when gold changes). */
const playerGoldRef = ref(0)
/** Faction and class for HUD (polled with level). */
const playerFactionRef = ref('')
const playerClassRef = ref('')
/** First skill cooldown for HUD (polled). */
const skillCooldownRef = ref(0)
const skillNameRef = ref('')
/** Player look yaw in radians (0 = North). For compass needle rotation. */
const playerYawRef = ref(0)
/** Previous level from last poll; used to detect level-up without interrupting gameplay. */
const previousLevelRef = ref<number | null>(null)
/** When set, show a non-blocking "Level X!" overlay; cleared after LEVEL_UP_DISPLAY_MS. */
const levelUpDisplayRef = ref<number | null>(null)
let levelXpInterval: ReturnType<typeof setInterval> | null = null
let levelUpHideTimeout: ReturnType<typeof setTimeout> | null = null

/** Quest log data (updated when opening and after accept/turn-in). */
const questListRef = ref({
  activeQuests: [] as ReturnType<typeof getActiveQuests>,
  availableQuestIds: [] as string[],
  completedQuestIds: [] as string[],
})

function refreshQuestList() {
  refreshQuestCollectObjectives()
  questListRef.value = {
    activeQuests: getActiveQuests(),
    availableQuestIds: getAvailableQuestIds(),
    completedQuestIds: getCompletedQuestIds(),
  }
}

/** Quest log props filtered by context: at NPC (questLogOfferedIds set) vs personal (Q). */
const questLogActiveQuests = computed(() => {
  const list = questListRef.value.activeQuests
  const offered = questLogOfferedIds.value
  if (offered == null) return list
  const set = new Set(offered)
  return list.filter((a) => set.has(a.questId))
})
const questLogAvailableQuestIds = computed(() => {
  const list = questListRef.value.availableQuestIds
  const offered = questLogOfferedIds.value
  if (offered == null) return []
  const set = new Set(offered)
  return list.filter((id) => set.has(id))
})
const questLogCompletedQuestIds = computed(() => {
  const list = questListRef.value.completedQuestIds
  const offered = questLogOfferedIds.value
  if (offered == null) return list
  const set = new Set(offered)
  return list.filter((id) => set.has(id))
})

/** Called by game when hotbar selection or slot counts change; keeps hotbarState in sync for HUD. */
function onHotbarChange(blocks: BlockType[], counts: number[]) {
  hotbarState.value = { blocks: [...blocks], counts: [...counts] }
}

let unsubscribeConnection: (() => void) | null = null

watch(gameMode, async (mode) => {
  if (!mode) return
  await nextTick()
  const crackEl = document.getElementById('block-crack')
  setBlockCrackElement(crackEl)
  function openQuestLogFromNpc(questGiver: {
    offeredQuestIds: string[]
    prerequisiteQuestIds?: string[]
  }) {
    refreshQuestList()
    questLogOfferedIds.value = [...questGiver.offeredQuestIds]
    const active = getActiveQuests()
    const available = getAvailableQuestIds()
    const offeredQuestIds = questGiver.offeredQuestIds
    const prereqsMet =
      questGiver.prerequisiteQuestIds == null ||
      questGiver.prerequisiteQuestIds.length === 0 ||
      questGiver.prerequisiteQuestIds.every((id) =>
        getCompletedQuestIds().includes(id),
      )
    const readyToTurnInId = offeredQuestIds.find((id) => {
      const a = active.find((q) => q.questId === id)
      if (!a) return false
      const quest = getQuestById(id)
      if (!quest) return false
      return quest.objectives.every((obj, i) => {
        const need = obj.type === 'kill' || obj.type === 'collect' ? obj.count : 1
        return a.progress[i] >= need
      })
    })
    const availableId =
      prereqsMet ? offeredQuestIds.find((id) => available.includes(id)) : undefined
    questLogInitialSelectedId.value = readyToTurnInId ?? availableId ?? null
    questLogAtQuestGiver.value = true
    document.exitPointerLock()
    questLogOpen.value = true
  }

  const opts = {
    multiplayer: mode === 'multiplayer',
    onHotbarChange,
    onCraftingTableUse: openCraftingTableMenu,
    onQuestNpcInteract: openQuestLogFromNpc,
  }
  if (canvasContainer.value) {
    initGame(canvasContainer.value, opts)
  } else {
    initGame(undefined, opts)
  }
  inventorySlots.value = getAllSlots()
  craftingTableSlots.value = getCraftingTableSlots()
  setOnInventoryChange(() => {
    inventorySlots.value = getAllSlots()
    craftingTableSlots.value = getCraftingTableSlots()
    const h = getHotbarSlots()
    onHotbarChange(
      h.map((s) => s.type ?? ''),
      h.map((s) => s.count),
    )
    refreshQuestCollectObjectives()
  })
  const refreshEquipment = () => {
    const eq: Record<string, { type: BlockType | null; count: number }> = {}
    for (const slot of EQUIPMENT_SLOTS) {
      const s = getEquipped(slot)
      eq[slot] = { type: s.type, count: s.count }
    }
    equipmentSlotsRef.value = eq as Record<EquipmentSlot, { type: BlockType | null; count: number }>
  }
  refreshEquipment()
  setOnEquipmentChange(refreshEquipment)
  setOnGoldChange(() => {
    playerGoldRef.value = getGold()
  })
  playerGoldRef.value = getGold()
  previousLevelRef.value = null
  if (levelXpInterval) clearInterval(levelXpInterval)
  levelXpInterval = setInterval(() => {
    const lvl = getPlayerLevel()
    const xp = getPlayerExperience()
    if (previousLevelRef.value !== null && lvl > previousLevelRef.value) {
      levelUpDisplayRef.value = lvl
      if (levelUpHideTimeout) clearTimeout(levelUpHideTimeout)
      levelUpHideTimeout = setTimeout(() => {
        levelUpDisplayRef.value = null
        levelUpHideTimeout = null
      }, LEVEL_UP_DISPLAY_MS)
    }
    previousLevelRef.value = lvl
    playerLevelRef.value = lvl
    xpProgressRef.value = getLevelProgress(lvl, xp)
    playerHealthRef.value = getPlayerHealth()
    playerMaxHealthRef.value = getPlayerMaxHealth()
    playerHungerRef.value = getPlayerHunger()
    playerMaxHungerRef.value = getPlayerMaxHunger()
    playerGoldRef.value = getGold()
    playerFactionRef.value = getFactionDisplayName(getPlayerFaction())
    playerClassRef.value = getClassDisplayName(getPlayerClass())
    const firstSkill = getFirstSkillForClass(getPlayerClass())
    skillNameRef.value = firstSkill?.name ?? ''
    skillCooldownRef.value = firstSkill ? getSkillCooldownRemaining(firstSkill.id) : 0
    playerYawRef.value = getPlayerYaw()
  }, 400)
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
  if (levelUpHideTimeout) clearTimeout(levelUpHideTimeout)
  if (levelXpInterval) clearInterval(levelXpInterval)
  setOnGoldChange(null)
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
      <!-- Level + XP (top left) -->
      <div
        aria-hidden="true"
        class="hud-panel fixed left-3 top-3 z-10 w-28 rounded-[var(--ui-radius-md)] border-2 px-2 py-1 pointer-events-none"
      >
        <div class="flex items-center justify-between text-xs font-semibold text-[var(--ui-text)]">
          <span>Lv {{ playerLevelRef }}</span>
          <span v-if="playerLevelRef < MAX_LEVEL" class="text-[10px] opacity-80">{{ Math.round(xpProgressRef * 100) }}%</span>
        </div>
        <div
          v-if="playerLevelRef < MAX_LEVEL"
          class="mt-0.5 h-1 w-full overflow-hidden rounded bg-black/40"
          role="progressbar"
          :aria-valuenow="xpProgressRef * 100"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div
            class="h-full rounded bg-amber-500 transition-[width] duration-300"
            :style="{ width: `${xpProgressRef * 100}%` }"
          />
        </div>
        <div class="mt-1 text-[10px] text-[var(--ui-text)] opacity-90">Gold: {{ playerGoldRef }}</div>
        <div class="mt-1 text-[10px] text-[var(--ui-text)] opacity-80">
          {{ playerFactionRef }} · {{ playerClassRef }}
        </div>
        <div v-if="skillNameRef" class="mt-1 flex items-center gap-1">
          <div
            class="h-5 w-6 rounded border border-[var(--ui-border)] bg-black/40 flex items-center justify-center text-[10px] text-[var(--ui-text)]"
            :title="`${skillNameRef} (R)${skillCooldownRef > 0 ? ` – ${skillCooldownRef.toFixed(1)}s` : ''}`"
          >
            {{ skillCooldownRef > 0 ? skillCooldownRef.toFixed(1) : 'R' }}
          </div>
          <span class="text-[10px] text-[var(--ui-text)] opacity-90">{{ skillNameRef }}</span>
        </div>
      </div>

      <!-- Compass (top centre): N, E, S, W with needle showing current heading (0 = North). -->
      <div
        aria-label="Compass: North, East, South, West"
        class="hud-panel fixed left-1/2 top-3 z-10 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border-2 border-amber-800/60 bg-stone-900/90 text-[var(--ui-text)] pointer-events-none"
      >
        <span class="compass-label compass-n">N</span>
        <span class="compass-label compass-e">E</span>
        <span class="compass-label compass-s">S</span>
        <span class="compass-label compass-w">W</span>
        <span
          class="compass-needle"
          :style="{ transform: `rotate(${(playerYawRef * 180) / Math.PI}deg)` }"
          aria-hidden="true"
        />
      </div>

      <!-- FPS (top right, left of inventory button) -->
      <div
        id="fps"
        aria-hidden="true"
        class="hud-panel fixed right-14 top-3 z-10 rounded-[var(--ui-radius-md)] border-2 px-2 py-1 font-mono text-xs text-[var(--ui-text)] pointer-events-none"
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

      <!-- Level-up overlay: non-blocking, no pointer capture, auto-hides so gameplay (e.g. combat) is uninterrupted -->
      <Transition name="level-up">
        <div
          v-if="levelUpDisplayRef !== null"
          aria-live="polite"
          aria-atomic="true"
          class="level-up-banner fixed left-1/2 top-1/3 z-20 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        >
          <span class="level-up-text">Level {{ levelUpDisplayRef }}!</span>
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

      <!-- Full map overlay (M) -->
      <FullMap :open="mapOpen" @close="mapOpen = false" />

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

      <!-- Health, XP, Hunger bars (bottom-left above hotbar) -->
      <div
        aria-hidden="true"
        class="hud-panel fixed bottom-20 left-3 z-10 w-48 rounded-[var(--ui-radius-md)] border-2 px-2 py-1.5 pointer-events-none space-y-1.5"
      >
        <div class="flex items-center gap-2">
          <span class="w-12 shrink-0 text-[10px] font-medium text-[var(--ui-text)]">Health</span>
          <div
            class="h-2 flex-1 min-w-0 overflow-hidden rounded bg-black/40"
            role="progressbar"
            :aria-valuenow="playerMaxHealthRef ? Math.round((playerHealthRef / playerMaxHealthRef) * 100) : 100"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              class="h-full rounded bg-red-500 transition-[width] duration-300"
              :style="{ width: `${playerMaxHealthRef ? (playerHealthRef / playerMaxHealthRef) * 100 : 100}%` }"
            />
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-12 shrink-0 text-[10px] font-medium text-[var(--ui-text)]">XP</span>
          <div
            class="h-2 flex-1 min-w-0 overflow-hidden rounded bg-black/40"
            role="progressbar"
            :aria-valuenow="Math.round(xpProgressRef * 100)"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              class="h-full rounded bg-amber-500 transition-[width] duration-300"
              :style="{ width: `${xpProgressRef * 100}%` }"
            />
          </div>
          <span v-if="playerLevelRef < MAX_LEVEL" class="shrink-0 text-[10px] opacity-80 text-[var(--ui-text)]">{{ Math.round(xpProgressRef * 100) }}%</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-12 shrink-0 text-[10px] font-medium text-[var(--ui-text)]">Hunger</span>
          <div
            class="h-2 flex-1 min-w-0 overflow-hidden rounded bg-black/40"
            role="progressbar"
            :aria-valuenow="playerMaxHungerRef ? Math.round((playerHungerRef / playerMaxHungerRef) * 100) : 100"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              class="h-full rounded bg-amber-600 transition-[width] duration-300"
              :style="{ width: `${playerMaxHungerRef ? (playerHungerRef / playerMaxHungerRef) * 100 : 100}%` }"
            />
          </div>
        </div>
      </div>

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

      <!-- Inventory overlay: full slots, equipment, move and craft callbacks -->
      <Transition name="modal">
        <Inventory
          v-if="inventoryOpen"
          :slots="inventorySlots"
          :equipment="equipmentSlotsRef"
          :player-class="getPlayerClass()"
          :can-equip="canEquip"
          :on-move="(from: number, to: number, amount?: number) => moveSlots(from, to, amount)"
          :on-craft-one="craftOne"
          :on-equip-from-inventory="(invIndex: number, equipSlot: EquipmentSlot) => tryEquipFromInventory(invIndex, equipSlot, getPlayerClass())"
          :on-unequip="tryUnequipToInventory"
          @close="closeInventory"
        />
      </Transition>

      <!-- Crafting table overlay: 3×3 grid + inventory (right-click on crafting table block) -->
      <Transition name="modal">
        <CraftingTable
          v-if="craftingTableOpen"
          :inventory-slots="inventorySlots.slice(0, 36)"
          :crafting-table-slots="craftingTableSlots"
          :on-move="handleCraftingTableMove"
          :on-craft-one="craftOne3x3"
          @close="closeCraftingTable"
        />
      </Transition>

      <!-- Pause menu (ESC): Resume, Options · Graphics -->
      <Transition name="modal">
        <PauseMenu v-if="pauseMenuOpen" @close="pauseMenuOpen = false" />
      </Transition>

      <!-- Quest Log (Q): active, available, turn-in -->
      <Transition name="modal">
        <QuestLog
          v-if="questLogOpen"
          :active-quests="questLogActiveQuests"
          :available-quest-ids="questLogAvailableQuestIds"
          :completed-quest-ids="questLogCompletedQuestIds"
          :initial-selected-quest-id="questLogInitialSelectedId"
          :at-quest-giver="questLogAtQuestGiver"
          :player-class="getPlayerClass()"
          :on-accept="(id) => { const ok = acceptQuest(id); if (ok) refreshQuestList(); return ok }"
          :on-turn-in="(id, rewardChoiceIndex) => { const ok = claimQuestReward(id, rewardChoiceIndex); if (ok) refreshQuestList(); return ok }"
          :on-abort="(id) => { const ok = abortQuest(id); if (ok) refreshQuestList(); return ok }"
          @close="questLogOpen = false"
        />
      </Transition>

      <!-- Chat: join/leave messages + chat (T/Enter to open) -->
      <Chat @open="chatOpen = true" @close="chatOpen = false" />

      <div ref="canvasContainer" class="game-canvas-wrap absolute inset-0 h-full w-full"></div>
    </template>
  </div>
</template>

<style scoped>
/* Compass: N/E/S/W at cardinal positions, needle rotates with player yaw (0 = North). */
.compass-label {
  position: absolute;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  color: var(--ui-text);
  opacity: 0.95;
}
.compass-n {
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
}
.compass-e {
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
}
.compass-s {
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
}
.compass-w {
  left: 2px;
  top: 50%;
  transform: translateY(-50%);
}
.compass-needle {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  margin-left: -4px;
  margin-top: -10px;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-bottom: 10px solid rgba(255, 200, 100, 0.9);
  transform-origin: 4px 10px;
  pointer-events: none;
}

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

/* Level-up: pop in, hold, then fade out; does not block input */
.level-up-banner {
  font-family: var(--ui-font);
  text-align: center;
}
.level-up-text {
  display: inline-block;
  padding: 0.5rem 1.25rem;
  font-size: 1.75rem;
  font-weight: 700;
  color: #fef3c7;
  text-shadow:
    0 0 12px rgba(251, 191, 36, 0.9),
    0 0 24px rgba(245, 158, 11, 0.5),
    0 2px 4px rgba(0, 0, 0, 0.8);
  background: linear-gradient(180deg, rgba(120, 53, 15, 0.85) 0%, rgba(69, 26, 3, 0.9) 100%);
  border: 2px solid rgba(251, 191, 36, 0.6);
  border-radius: var(--ui-radius-lg);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}
.level-up-enter-active {
  animation: level-up-pop 0.45s ease-out;
}
.level-up-leave-active {
  transition: opacity 0.5s ease-out;
}
.level-up-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(1.05);
}
@keyframes level-up-pop {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.6);
  }
  70% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.08);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* Game canvas must sit behind HUD so crosshair and block-crack overlay are visible */
.game-canvas-wrap {
  z-index: 0;
}

/* Block crack overlay: centered like crosshair, 10 stages via sprite; above canvas */
.block-crack-overlay {
  position: fixed;
  left: 50%;
  top: 50%;
  width: 80px;
  height: 80px;
  margin-left: -40px;
  margin-top: -40px;
  z-index: 50;
  pointer-events: none;
  visibility: hidden;
  background-image: url('/crack_stages.svg');
  background-repeat: no-repeat;
  background-position: 0 0;
  background-size: 100% 1000%;
}
</style>

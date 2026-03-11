<script setup lang="ts">
/**
 * Inventory overlay: Minecraft-style layout (armor, 2×2 crafting + result, 3×9 inventory, 1×9 hotbar).
 * Binds to inventory state; supports drag-and-drop and crafting.
 */
import { computed, ref } from 'vue'
import type { BlockType } from '../types'
import type { InventorySlot } from '../inventory'
import { BLOCK_ICON } from '../hotbar-icons'
import { matchRecipe2x2 } from '../recipes'
import { getBlockDisplayName } from '../block-registry'

/** Fallback when block icon fails to load. */
const FALLBACK_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="%23888"/></svg>',
  )

const emit = defineEmits<{ close: [] }>()

const props = defineProps<{
  /** All 40 slots (0–8 hotbar, 9–35 main, 36–39 crafting). */
  slots: InventorySlot[]
  /** Move items between slots (fromIndex, toIndex). */
  onMove: (fromIndex: number, toIndex: number) => void
  /** Perform one craft from 2×2 grid; returns true if crafted. */
  onCraftOne: () => boolean
}>()

const armorSlots = [
  { id: 'helm', label: 'Helmet' },
  { id: 'chest', label: 'Chestplate' },
  { id: 'legs', label: 'Leggings' },
  { id: 'boots', label: 'Boots' },
]

const CRAFTING_START = 36
const HOTBAR_START = 0
const MAIN_START = 9

/** Index being dragged (null when not dragging). */
const dragIndex = ref<number | null>(null)

/** Craft result from current 2×2 grid (for display and craft-one click). */
const craftResult = computed(() => {
  const grid = (props.slots ?? []).slice(CRAFTING_START, CRAFTING_START + 4).map((s) => s.type)
  return matchRecipe2x2(grid)
})

function getSlot(index: number): InventorySlot {
  const list = props.slots ?? []
  const s = list[index]
  return s && s.count > 0 && s.type ? { type: s.type, count: s.count } : { type: null, count: 0 }
}

function handleDragStart(e: DragEvent, index: number) {
  const slot = getSlot(index)
  if (slot.count <= 0) return
  dragIndex.value = index
  e.dataTransfer?.setData('text/plain', String(index))
  e.dataTransfer!.effectAllowed = 'move'
}

function handleDragEnd() {
  dragIndex.value = null
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
}

function handleDrop(e: DragEvent, toIndex: number) {
  e.preventDefault()
  const fromIndex = dragIndex.value ?? (e.dataTransfer?.getData('text/plain') ? parseInt(e.dataTransfer.getData('text/plain'), 10) : null)
  if (fromIndex == null || fromIndex === toIndex) return
  props.onMove(fromIndex, toIndex)
  dragIndex.value = null
}

function handleCraftResultClick() {
  if (craftResult.value && props.onCraftOne()) {
    // Crafted; UI will update via slots prop
  }
}
</script>

<template>
  <div
    class="inventory-overlay fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Inventory"
    @click.self="emit('close')"
  >
    <div
      class="inventory-panel flex gap-6 rounded-[var(--ui-radius-lg)] border-4 p-4"
      style="
        border-color: var(--ui-border);
        background: rgba(50, 45, 40, 0.97);
        box-shadow: var(--ui-shadow-panel);
      "
    >
      <!-- Left column: armor + player + off-hand + recipe book -->
      <div class="flex flex-col items-center gap-2">
        <div class="flex flex-col gap-1">
          <div
            v-for="slot in armorSlots"
            :key="slot.id"
            class="slot armor-slot flex h-10 w-10 items-center justify-center rounded-[var(--ui-radius-sm)] border-2 border-[#3a3a3a] bg-[rgba(40,38,35,0.95)]"
            :title="slot.label"
          >
            <span class="slot-icon text-[14px] text-white/70" :data-slot="slot.id">
              {{
                slot.id === 'helm'
                  ? '🪖'
                  : slot.id === 'chest'
                    ? '🦺'
                    : slot.id === 'legs'
                      ? '👖'
                      : '👢'
              }}
            </span>
          </div>
        </div>
        <div
          class="player-preview flex h-20 w-16 items-center justify-center rounded-[var(--ui-radius-sm)] border-2 border-[#3a3a3a] bg-[rgba(35,33,30,0.95)] text-[10px] font-bold text-white/80"
        >
          Player
        </div>
        <div
          class="slot flex h-10 w-10 items-center justify-center rounded-[var(--ui-radius-sm)] border-2 border-[#3a3a3a] bg-[rgba(40,38,35,0.95)]"
          title="Off-Hand"
        >
          <span class="text-white/50 text-xs">🛡</span>
        </div>
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-[var(--ui-radius-sm)] border-2 border-[#3a3a3a] bg-[rgba(40,38,35,0.95)] text-white/70 hover:border-[var(--ui-border-hover)] hover:bg-[rgba(55,52,48,0.95)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-accent)] focus-visible:outline-offset-2"
          title="Recipe book"
          aria-label="Recipe book"
        >
          <span class="text-lg">📖</span>
        </button>
      </div>

      <!-- Right side: crafting + inventory + hotbar -->
      <div class="flex flex-col gap-3">
        <!-- Crafting area -->
        <div class="flex flex-col gap-1.5">
          <h3 class="text-xs font-bold uppercase tracking-wider text-white/90">Crafting</h3>
          <div class="flex items-center gap-2">
            <div class="grid grid-cols-2 gap-0.5">
              <div
                v-for="idx in 4"
                :key="idx"
                class="inventory-slot slot flex h-9 w-9 cursor-grab items-center justify-center rounded-[var(--ui-radius-sm)] border-2 border-[#3a3a3a] bg-[rgba(40,38,35,0.95)] active:cursor-grabbing"
                :class="{ 'opacity-70': dragIndex === CRAFTING_START + idx - 1 }"
                :title="getSlot(CRAFTING_START + idx - 1).type ? getBlockDisplayName(getSlot(CRAFTING_START + idx - 1).type!) : `Crafting ${idx}`"
                :draggable="!!getSlot(CRAFTING_START + idx - 1).type"
                @dragstart="handleDragStart($event, CRAFTING_START + idx - 1)"
                @dragend="handleDragEnd"
                @dragover="handleDragOver"
                @drop="handleDrop($event, CRAFTING_START + idx - 1)"
              >
                <template v-if="getSlot(CRAFTING_START + idx - 1).type">
                  <img
                    :src="BLOCK_ICON[getSlot(CRAFTING_START + idx - 1).type!]"
                    :alt="getBlockDisplayName(getSlot(CRAFTING_START + idx - 1).type!)"
                    class="pointer-events-none h-full w-full object-cover object-center"
                    @error="(e: Event) => ((e.target as HTMLImageElement).src = FALLBACK_ICON)"
                  />
                  <span
                    v-if="getSlot(CRAFTING_START + idx - 1).count > 1"
                    class="absolute bottom-0 right-0.5 z-10 text-[9px] font-bold leading-tight text-white drop-shadow-[0_0_1px_#000]"
                  >
                    {{ getSlot(CRAFTING_START + idx - 1).count }}
                  </span>
                </template>
              </div>
            </div>
            <span class="text-white/50 text-lg">→</span>
            <div
              class="slot result-slot flex h-9 w-9 cursor-pointer items-center justify-center rounded-sm border-2 border-[#3a3a3a] bg-[rgba(40,38,35,0.95)] hover:border-[#5a5a5a]"
              :title="craftResult ? `${getBlockDisplayName(craftResult.result.type)} (${craftResult.result.count})` : 'Result'"
              @click="handleCraftResultClick"
            >
              <template v-if="craftResult">
                <img
                  :src="BLOCK_ICON[craftResult.result.type]"
                  :alt="getBlockDisplayName(craftResult.result.type)"
                  class="pointer-events-none h-full w-full object-cover object-center"
                  @error="(e: Event) => ((e.target as HTMLImageElement).src = FALLBACK_ICON)"
                />
                <span
                  v-if="craftResult.result.count > 1"
                  class="absolute bottom-0 right-0.5 z-10 text-[9px] font-bold leading-tight text-white drop-shadow-[0_0_1px_#000]"
                >
                  {{ craftResult.result.count }}
                </span>
              </template>
            </div>
          </div>
        </div>

        <!-- Inventory 3×9 -->
        <div class="grid grid-cols-9 gap-0.5">
          <div
            v-for="i in 27"
            :key="i - 1"
            class="inventory-slot slot relative flex h-9 w-9 cursor-grab items-center justify-center rounded-[var(--ui-radius-sm)] border-2 border-[#3a3a3a] bg-[rgba(40,38,35,0.95)] active:cursor-grabbing"
            :class="{ 'opacity-70': dragIndex === MAIN_START + i - 1 }"
            :title="getSlot(MAIN_START + i - 1).type ? getBlockDisplayName(getSlot(MAIN_START + i - 1).type!) : `Slot ${i}`"
            :draggable="!!getSlot(MAIN_START + i - 1).type"
            @dragstart="handleDragStart($event, MAIN_START + i - 1)"
            @dragend="handleDragEnd"
            @dragover="handleDragOver"
            @drop="handleDrop($event, MAIN_START + i - 1)"
          >
            <template v-if="getSlot(MAIN_START + i - 1).type">
              <img
                :src="BLOCK_ICON[getSlot(MAIN_START + i - 1).type!]"
                :alt="getBlockDisplayName(getSlot(MAIN_START + i - 1).type!)"
                class="pointer-events-none h-full w-full object-cover object-center"
                @error="(e: Event) => ((e.target as HTMLImageElement).src = FALLBACK_ICON)"
              />
              <span
                v-if="getSlot(MAIN_START + i - 1).count > 1"
                class="absolute bottom-0 right-0.5 z-10 text-[9px] font-bold leading-tight text-white drop-shadow-[0_0_1px_#000]"
              >
                {{ getSlot(MAIN_START + i - 1).count }}
              </span>
            </template>
          </div>
        </div>

        <!-- Hotbar (1×9) -->
        <div class="grid grid-cols-9 gap-0.5">
          <div
            v-for="i in 9"
            :key="i - 1"
            class="inventory-slot slot hotbar-slot relative flex h-9 w-9 cursor-grab items-center justify-center overflow-hidden rounded-[var(--ui-radius-sm)] border-2 border-[#3a3a3a] bg-[rgba(40,38,35,0.95)] active:cursor-grabbing"
            :class="{ 'opacity-70': dragIndex === HOTBAR_START + i - 1 }"
            :title="getSlot(HOTBAR_START + i - 1).type ? getBlockDisplayName(getSlot(HOTBAR_START + i - 1).type!) : `Slot ${i}`"
            :draggable="!!getSlot(HOTBAR_START + i - 1).type"
            @dragstart="handleDragStart($event, HOTBAR_START + i - 1)"
            @dragend="handleDragEnd"
            @dragover="handleDragOver"
            @drop="handleDrop($event, HOTBAR_START + i - 1)"
          >
            <span
              class="absolute left-0.5 top-0 z-10 text-[8px] text-white/70 drop-shadow-[0_0_1px_#000]"
            >
              {{ i }}
            </span>
            <template v-if="getSlot(HOTBAR_START + i - 1).type">
              <img
                :src="BLOCK_ICON[getSlot(HOTBAR_START + i - 1).type!]"
                :alt="getBlockDisplayName(getSlot(HOTBAR_START + i - 1).type!)"
                class="pointer-events-none h-full w-full object-cover object-center"
                @error="(e: Event) => ((e.target as HTMLImageElement).src = FALLBACK_ICON)"
              />
              <span
                v-if="getSlot(HOTBAR_START + i - 1).count > 1"
                class="absolute bottom-0 right-0.5 z-10 text-[9px] font-bold leading-tight text-white drop-shadow-[0_0_1px_#000]"
              >
                {{ getSlot(HOTBAR_START + i - 1).count }}
              </span>
            </template>
          </div>
        </div>
      </div>

      <div class="absolute right-2 top-2 flex items-center gap-2">
        <span class="text-[10px] text-white/50">ESC</span>
        <button
          type="button"
          class="rounded-[var(--ui-radius-sm)] border px-2 py-1 text-xs text-[var(--ui-text)] hover:bg-[var(--ui-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-accent)] focus-visible:outline-offset-2"
          style="border-color: var(--ui-border); background: #3a3a3a"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
    </div>

    <div
      class="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-1 rounded bg-black/40 px-2 py-1"
    >
      <div class="flex gap-0.5" aria-label="Health">
        <span
          v-for="j in 10"
          :key="'hp-' + j"
          class="text-red-500 drop-shadow"
          style="text-shadow: 0 0 1px #000"
          >❤</span
        >
      </div>
      <div class="flex gap-0.5" aria-label="Hunger">
        <span
          v-for="j in 10"
          :key="'food-' + j"
          class="text-amber-600 drop-shadow"
          style="text-shadow: 0 0 1px #000"
          >🍗</span
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.inventory-overlay {
  backdrop-filter: blur(2px);
}

.inventory-panel {
  position: relative;
}

.slot {
  transition:
    border-color 0.1s,
    box-shadow 0.1s;
}
.slot:hover {
  border-color: #5a5a5a;
}

.hotbar-slot {
  position: relative;
}

.inventory-slot,
.result-slot {
  position: relative;
}
</style>

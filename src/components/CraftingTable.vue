<script setup lang="ts">
/**
 * Crafting table overlay: 3×3 grid + result, plus hotbar and main inventory for moving items.
 * Shown when the player right-clicks a crafting table block.
 */
import { computed, ref } from 'vue'
import type { InventorySlot } from '../inventory'
import { BLOCK_ICON } from '../hotbar-icons'
import { matchRecipe3x3 } from '../recipes'
import { getBlockDisplayName } from '../block-registry'

/** Fallback when block icon fails to load. */
const FALLBACK_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="%23888"/></svg>',
  )

const emit = defineEmits<{ close: [] }>()

const props = defineProps<{
  /** Inventory slots 0–35 (hotbar 0–8, main 9–35). */
  inventorySlots: InventorySlot[]
  /** 3×3 crafting table grid (9 slots, row-major). */
  craftingTableSlots: InventorySlot[]
  /** Move between inventory (0–35) and table (36–44). from/to are virtual indices 0–44. */
  onMove: (fromIndex: number, toIndex: number, amount?: number) => void
  /** Shift+click: move stack from inventory to table or table to inventory (Minecraft-style). */
  onShiftClick?: (virtualIndex: number) => void
  /** Perform one craft from 3×3 grid; returns true if crafted. */
  onCraftOne: () => boolean
}>()

/** Virtual slot index: 0–35 = inventory, 36–44 = crafting table (36 = table slot 0). */
const TABLE_START = 36
const HOTBAR_START = 0
const MAIN_START = 9

/** Index being dragged (null when not dragging). Virtual index 0–44. */
const dragIndex = ref<number | null>(null)

/** When set, next right-click on another slot moves one item from this slot (split mode). */
const splitSourceIndex = ref<number | null>(null)

/** Combined list for template: [inventory 0–35, table 36–44]. */
const allSlots = computed(() => [
  ...(props.inventorySlots ?? []),
  ...(props.craftingTableSlots ?? []),
])

/** Craft result from current 3×3 grid. */
const craftResult = computed(() => {
  const grid = (props.craftingTableSlots ?? []).slice(0, 9).map((s) => s.type)
  return matchRecipe3x3(grid)
})

function getSlot(virtualIndex: number): InventorySlot {
  const list = allSlots.value
  if (virtualIndex < 0 || virtualIndex >= list.length) return { type: null, count: 0 }
  const s = list[virtualIndex]
  return s && s.count > 0 && s.type ? { type: s.type, count: s.count } : { type: null, count: 0 }
}

function handleDragStart(e: DragEvent, virtualIndex: number) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    return
  }
  const slot = getSlot(virtualIndex)
  if (slot.count <= 0) return
  dragIndex.value = virtualIndex
  e.dataTransfer?.setData('text/plain', String(virtualIndex))
  e.dataTransfer!.effectAllowed = 'move'
}

function handleDragEnd() {
  dragIndex.value = null
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
}

function handleDrop(e: DragEvent, toVirtualIndex: number) {
  e.preventDefault()
  splitSourceIndex.value = null
  const fromIndex =
    dragIndex.value ??
    (e.dataTransfer?.getData('text/plain') ? parseInt(e.dataTransfer.getData('text/plain'), 10) : null)
  if (fromIndex == null || fromIndex === toVirtualIndex) return
  props.onMove(fromIndex, toVirtualIndex)
  dragIndex.value = null
}

/**
 * Right-click or Ctrl/Cmd+click: split-one (move one item). Handled on mousedown for trackpads.
 */
function handleSplitOne(e: MouseEvent, virtualIndex: number) {
  e.preventDefault()
  e.stopPropagation()
  const prev = splitSourceIndex.value
  if (prev == null) {
    const slot = getSlot(virtualIndex)
    if (slot.count <= 0) return
    splitSourceIndex.value = virtualIndex
    return
  }
  if (prev === virtualIndex) return
  props.onMove(prev, virtualIndex, 1)
  splitSourceIndex.value = null
}

function isSplitModifierOrRight(e: MouseEvent): boolean {
  return e.button === 2 || (e.button === 0 && (e.ctrlKey || e.metaKey))
}

/** Shift+left-click: move full stack to other area (inventory <-> table). */
function handleShiftClick(e: MouseEvent, virtualIndex: number) {
  if (e.button !== 0 || !e.shiftKey || e.ctrlKey || e.metaKey) return
  const slot = getSlot(virtualIndex)
  if (slot.count <= 0 || !slot.type) return
  props.onShiftClick?.(virtualIndex)
}

function handleSlotMouseDown(e: MouseEvent, virtualIndex: number) {
  if (isSplitModifierOrRight(e)) {
    handleSplitOne(e, virtualIndex)
    return
  }
  if (e.button === 0 && e.shiftKey) {
    e.preventDefault()
    e.stopPropagation()
    handleShiftClick(e, virtualIndex)
  }
}

function handleCraftResultClick() {
  if (craftResult.value && props.onCraftOne()) {
    // Crafted; UI updates via props
  }
}
</script>

<template>
  <div
    class="crafting-table-overlay fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Crafting Table"
    @click.self="emit('close')"
  >
    <div
      class="crafting-table-panel flex gap-6 rounded-[var(--ui-radius-lg)] border-4 p-4"
      style="
        border-color: var(--ui-border);
        background: rgba(50, 45, 40, 0.97);
        box-shadow: var(--ui-shadow-panel);
      "
    >
      <!-- Left: 3×3 grid + result -->
      <div class="flex flex-col gap-3">
        <h2 class="text-sm font-bold uppercase tracking-wider text-white/90">Crafting Table</h2>
        <div class="flex items-start gap-2">
          <div class="grid grid-cols-3 gap-0.5">
            <div
              v-for="idx in 9"
              :key="idx"
              :data-virtual-index="TABLE_START + idx - 1"
              class="inventory-slot slot relative flex h-9 w-9 cursor-grab items-center justify-center rounded-[var(--ui-radius-sm)] border-2 bg-[rgba(40,38,35,0.95)] active:cursor-grabbing"
              :class="[
                dragIndex === TABLE_START + idx - 1 ? 'opacity-70' : '',
                splitSourceIndex === TABLE_START + idx - 1
                  ? 'border-amber-400 ring-2 ring-amber-400/50'
                  : 'border-[#3a3a3a]',
              ]"
              :title="
                getSlot(TABLE_START + idx - 1).type
                  ? getBlockDisplayName(getSlot(TABLE_START + idx - 1).type!)
                  : `Grid ${idx}`
              "
              :draggable="!!getSlot(TABLE_START + idx - 1).type"
              @dragstart="handleDragStart($event, TABLE_START + idx - 1)"
              @dragend="handleDragEnd"
              @dragover="handleDragOver"
              @drop="handleDrop($event, TABLE_START + idx - 1)"
              @mousedown="(e) => handleSlotMouseDown(e, TABLE_START + idx - 1)"
              @contextmenu.prevent
            >
              <template v-if="getSlot(TABLE_START + idx - 1).type">
                <img
                  :src="BLOCK_ICON[getSlot(TABLE_START + idx - 1).type!]"
                  :alt="getBlockDisplayName(getSlot(TABLE_START + idx - 1).type!)"
                  class="pointer-events-none h-full w-full object-cover object-center"
                  @error="(e: Event) => ((e.target as HTMLImageElement).src = FALLBACK_ICON)"
                />
                <span
                  v-if="getSlot(TABLE_START + idx - 1).count > 1"
                  class="absolute bottom-0 right-0.5 z-10 text-[9px] font-bold leading-tight text-white drop-shadow-[0_0_1px_#000]"
                >
                  {{ getSlot(TABLE_START + idx - 1).count }}
                </span>
              </template>
            </div>
          </div>
          <span class="text-white/50 text-lg">→</span>
          <div
            class="slot result-slot flex h-9 w-9 cursor-pointer items-center justify-center rounded-sm border-2 border-[#3a3a3a] bg-[rgba(40,38,35,0.95)] hover:border-[#5a5a5a]"
            :title="
              craftResult
                ? `${getBlockDisplayName(craftResult.result.type)} (${craftResult.result.count})`
                : 'Result'
            "
            @click.stop="handleCraftResultClick"
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

      <!-- Right: inventory 3×9 + hotbar -->
      <div class="flex flex-col gap-3">
        <h3 class="text-xs font-bold uppercase tracking-wider text-white/90">Inventory</h3>
        <div class="grid grid-cols-9 gap-0.5">
          <div
            v-for="i in 27"
            :key="'main-' + i"
            class="inventory-slot slot relative flex h-9 w-9 cursor-grab items-center justify-center rounded-[var(--ui-radius-sm)] border-2 bg-[rgba(40,38,35,0.95)] active:cursor-grabbing"
            :class="[
              dragIndex === MAIN_START + i - 1 ? 'opacity-70' : '',
              splitSourceIndex === MAIN_START + i - 1
                ? 'border-amber-400 ring-2 ring-amber-400/50'
                : 'border-[#3a3a3a]',
            ]"
            :title="
              getSlot(MAIN_START + i - 1).type
                ? getBlockDisplayName(getSlot(MAIN_START + i - 1).type!)
                : `Slot ${i}`
            "
            :draggable="!!getSlot(MAIN_START + i - 1).type"
            @dragstart="handleDragStart($event, MAIN_START + i - 1)"
            @dragend="handleDragEnd"
            @dragover="handleDragOver"
            @drop="handleDrop($event, MAIN_START + i - 1)"
            @mousedown="(e) => handleSlotMouseDown(e, MAIN_START + i - 1)"
            @contextmenu.prevent
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
        <div class="grid grid-cols-9 gap-0.5">
          <div
            v-for="i in 9"
            :key="'hotbar-' + i"
            class="inventory-slot slot hotbar-slot relative flex h-9 w-9 cursor-grab items-center justify-center overflow-hidden rounded-[var(--ui-radius-sm)] border-2 bg-[rgba(40,38,35,0.95)] active:cursor-grabbing"
            :class="[
              dragIndex === HOTBAR_START + i - 1 ? 'opacity-70' : '',
              splitSourceIndex === HOTBAR_START + i - 1
                ? 'border-amber-400 ring-2 ring-amber-400/50'
                : 'border-[#3a3a3a]',
            ]"
            :title="
              getSlot(HOTBAR_START + i - 1).type
                ? getBlockDisplayName(getSlot(HOTBAR_START + i - 1).type!)
                : `Hotbar ${i}`
            "
            :draggable="!!getSlot(HOTBAR_START + i - 1).type"
            @dragstart="handleDragStart($event, HOTBAR_START + i - 1)"
            @dragend="handleDragEnd"
            @dragover="handleDragOver"
            @drop="handleDrop($event, HOTBAR_START + i - 1)"
            @mousedown="(e) => handleSlotMouseDown(e, HOTBAR_START + i - 1)"
            @contextmenu.prevent
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

      <div class="absolute right-2 top-2 flex flex-col items-end gap-1">
        <span class="text-[10px] text-white/50"
          >Shift+click: move stack · Right-click or Ctrl+click: move one · ESC to close</span
        >
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
  </div>
</template>

<style scoped>
.crafting-table-overlay {
  backdrop-filter: blur(2px);
}

.crafting-table-panel {
  position: relative;
}

.slot {
  transition: border-color 0.1s, box-shadow 0.1s;
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

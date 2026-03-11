<script setup lang="ts">
import type { BlockType } from '../types'
import { BLOCK_ICON, BLOCK_LABEL } from '../hotbar-icons'

/** Fallback when block icon fails to load. */
const FALLBACK_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="%23888"/></svg>',
  )

defineEmits<{ close: [] }>()

defineProps<{
  hotbarBlocks?: BlockType[]
  hotbarCounts?: number[]
}>()

const armorSlots = [
  { id: 'helm', label: 'Helmet' },
  { id: 'chest', label: 'Chestplate' },
  { id: 'legs', label: 'Leggings' },
  { id: 'boots', label: 'Boots' },
]

/** 2×2 crafting + 1 result */
const craftingSlots = 4

/** 3 rows × 9 (same as in-game) */
const inventoryRows = 3
const inventoryCols = 9
const inventorySlotCount = inventoryRows * inventoryCols
const emptySlots = Array.from({ length: inventorySlotCount }, () => null)
</script>

<template>
  <div
    class="inventory-overlay fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Inventory"
    @click.self="$emit('close')"
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
        <!-- Armor slots (4 vertical) -->
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
        <!-- Player preview (placeholder) -->
        <div
          class="player-preview flex h-20 w-16 items-center justify-center rounded-[var(--ui-radius-sm)] border-2 border-[#3a3a3a] bg-[rgba(35,33,30,0.95)] text-[10px] font-bold text-white/80"
        >
          Player
        </div>
        <!-- Off-Hand Slot -->
        <div
          class="slot flex h-10 w-10 items-center justify-center rounded-[var(--ui-radius-sm)] border-2 border-[#3a3a3a] bg-[rgba(40,38,35,0.95)]"
          title="Off-Hand"
        >
          <span class="text-white/50 text-xs">🛡</span>
        </div>
        <!-- Rezeptbuch -->
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
                v-for="i in craftingSlots"
                :key="i"
                class="slot flex h-9 w-9 items-center justify-center rounded-[var(--ui-radius-sm)] border-2 border-[#3a3a3a] bg-[rgba(40,38,35,0.95)]"
              />
            </div>
            <span class="text-white/50 text-lg">→</span>
            <div
              class="slot flex h-9 w-9 items-center justify-center rounded-sm border-2 border-[#3a3a3a] bg-[rgba(40,38,35,0.95)]"
            />
          </div>
        </div>

        <!-- Inventory 3×9 -->
        <div class="grid grid-cols-9 gap-0.5">
          <div
            v-for="(label, i) in emptySlots"
            :key="i"
            class="slot flex h-9 w-9 items-center justify-center rounded-[var(--ui-radius-sm)] border-2 border-[#3a3a3a] bg-[rgba(40,38,35,0.95)] text-[9px] font-bold leading-tight text-white [text-shadow:0_1px_1px_#000]"
            :title="label || `Slot ${i + 1}`"
          >
            {{ label || '' }}
          </div>
        </div>

        <!-- Hotbar (1×9, same icons as in-game) -->
        <div class="grid grid-cols-9 gap-0.5">
          <div
            v-for="i in 9"
            :key="i - 1"
            class="slot hotbar-slot relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-[var(--ui-radius-sm)] border-2 border-[#3a3a3a] bg-[rgba(40,38,35,0.95)]"
            :title="hotbarBlocks?.[i - 1] ? BLOCK_LABEL[hotbarBlocks[i - 1]] : `Slot ${i}`"
          >
            <span
              class="absolute left-0.5 top-0 z-10 text-[8px] text-white/70 drop-shadow-[0_0_1px_#000]"
            >
              {{ i }}
            </span>
            <img
              v-if="hotbarBlocks?.[i - 1]"
              :src="BLOCK_ICON[hotbarBlocks[i - 1]]"
              :alt="BLOCK_LABEL[hotbarBlocks[i - 1]]"
              class="h-full w-full object-cover object-center"
              @error="(e: Event) => ((e.target as HTMLImageElement).src = FALLBACK_ICON)"
            />
            <span
              v-if="hotbarBlocks?.[i - 1] && (hotbarCounts?.[i - 1] ?? 0) > 1"
              class="absolute bottom-0 right-0.5 z-10 text-[9px] font-bold leading-tight text-white drop-shadow-[0_0_1px_#000]"
            >
              {{ hotbarCounts?.[i - 1] }}
            </span>
          </div>
        </div>
      </div>

      <!-- Close + ESC hint -->
      <div class="absolute right-2 top-2 flex items-center gap-2">
        <span class="text-[10px] text-white/50">ESC</span>
        <button
          type="button"
          class="rounded-[var(--ui-radius-sm)] border px-2 py-1 text-xs text-[var(--ui-text)] hover:bg-[var(--ui-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-accent)] focus-visible:outline-offset-2"
          style="border-color: var(--ui-border); background: #3a3a3a"
          @click="$emit('close')"
        >
          Close
        </button>
      </div>
    </div>

    <!-- Gesundheits- und Hungerleiste unten -->
    <div
      class="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-1 rounded bg-black/40 px-2 py-1"
    >
      <div class="flex gap-0.5" aria-label="Leben">
        <span
          v-for="i in 10"
          :key="'hp-' + i"
          class="text-red-500 drop-shadow"
          style="text-shadow: 0 0 1px #000"
          >❤</span
        >
      </div>
      <div class="flex gap-0.5" aria-label="Hunger">
        <span
          v-for="i in 10"
          :key="'food-' + i"
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
</style>

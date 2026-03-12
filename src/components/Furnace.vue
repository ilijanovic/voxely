<script setup lang="ts">
/**
 * Furnace overlay: input, fuel, output slots and smelting progress.
 * Items can be moved from hotbar to input/fuel and output can be taken to inventory.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import {
  getFurnaceInput,
  getFurnaceFuel,
  getFurnaceOutput,
  getFurnaceBurnTimeRemaining,
  getFurnaceCookProgress,
  tickFurnace,
  setFurnaceInput,
  setFurnaceFuel,
  setFurnaceOutput,
  setOnFurnaceChange,
} from '../furnace-state'
import { getSmeltingRecipe } from '../smelting'
import {
  getSelectedBlockType,
  getSelectedSlotCount,
  consumeOneFromSelectedSlot,
} from '../game-hotbar'
import { BLOCK_ICON } from '../hotbar-icons'
import { getBlockDisplayName } from '../block-registry'
import { addItem } from '../inventory'

const FALLBACK_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="%23888"/></svg>',
  )

const emit = defineEmits<{ close: [] }>()

const input = ref(getFurnaceInput())
const fuel = ref(getFurnaceFuel())
const output = ref(getFurnaceOutput())
const burnRemaining = ref(0)
const cookProgress = ref(0)

let tickInterval: ReturnType<typeof setInterval> | null = null

function refresh(): void {
  input.value = getFurnaceInput()
  fuel.value = getFurnaceFuel()
  output.value = getFurnaceOutput()
  burnRemaining.value = getFurnaceBurnTimeRemaining()
  cookProgress.value = getFurnaceCookProgress()
}

function takeOutput(): void {
  const out = getFurnaceOutput()
  if (out.type && out.count > 0) {
    addItem(out.type, out.count)
    setFurnaceOutput(null, 0)
  }
  refresh()
}

function putOneInInput(): void {
  const type = getSelectedBlockType()
  const count = getSelectedSlotCount()
  if (!type || count <= 0) return
  const cur = getFurnaceInput()
  if (cur.type != null && cur.type !== type) return
  if (!consumeOneFromSelectedSlot()) return
  setFurnaceInput(type, (cur.type === type ? cur.count : 0) + 1)
  refresh()
}

function putOneInFuel(): void {
  const type = getSelectedBlockType()
  const count = getSelectedSlotCount()
  if (!type || count <= 0) return
  const cur = getFurnaceFuel()
  if (cur.type != null && cur.type !== type) return
  if (!consumeOneFromSelectedSlot()) return
  setFurnaceFuel(type, (cur.type === type ? cur.count : 0) + 1)
  refresh()
}

onMounted(() => {
  setOnFurnaceChange(refresh)
  refresh()
  tickInterval = setInterval(() => {
    tickFurnace(0.1)
    refresh()
  }, 100)
})

onUnmounted(() => {
  setOnFurnaceChange(null)
  if (tickInterval) clearInterval(tickInterval)
})
</script>

<template>
  <div
    class="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
    @click.self="emit('close')"
  >
    <div
      class="rounded-lg border-2 border-[var(--ui-border)] bg-[var(--ui-bg)] p-4 shadow-xl"
      role="dialog"
      aria-label="Furnace"
    >
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-[var(--ui-text)]">Furnace</h2>
        <button
          type="button"
          class="rounded px-2 py-1 text-sm text-[var(--ui-text)] hover:bg-white/10"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
      <div class="flex items-center gap-6">
        <div class="flex flex-col items-center gap-1">
          <span class="text-xs text-[var(--ui-text)]">Input</span>
          <div
            class="relative flex h-12 w-12 cursor-pointer items-center justify-center rounded border-2 border-[var(--ui-border)] bg-black/30 hover:border-amber-500"
            @click="putOneInInput"
          >
            <img
              v-if="input.type"
              :src="BLOCK_ICON[input.type]"
              :alt="getBlockDisplayName(input.type)"
              class="h-8 w-8 object-contain"
              @error="(e: Event) => ((e.target as HTMLImageElement).src = FALLBACK_ICON)"
            />
            <span
              v-if="input.type && input.count > 1"
              class="absolute bottom-0 right-0 text-xs text-white"
            >
              {{ input.count }}
            </span>
          </div>
        </div>
        <div class="flex flex-col items-center gap-1">
          <span class="text-xs text-[var(--ui-text)]">Fuel</span>
          <div
            class="relative flex h-12 w-12 cursor-pointer items-center justify-center rounded border-2 border-[var(--ui-border)] bg-black/30 hover:border-amber-500"
            @click="putOneInFuel"
          >
            <img
              v-if="fuel.type"
              :src="BLOCK_ICON[fuel.type]"
              :alt="getBlockDisplayName(fuel.type)"
              class="h-8 w-8 object-contain"
              @error="(e: Event) => ((e.target as HTMLImageElement).src = FALLBACK_ICON)"
            />
            <span v-if="fuel.type && fuel.count > 1" class="absolute bottom-0 right-0 text-xs text-white">
              {{ fuel.count }}
            </span>
          </div>
        </div>
        <div class="h-8 w-12 rounded bg-amber-900/50" title="Progress">
          <div
            class="h-full rounded bg-amber-600 transition-[width] duration-150"
            :style="{
              width: getSmeltingRecipe(input.type)
                ? `${Math.min(100, (cookProgress / getSmeltingRecipe(input.type)!.cookTimeSeconds) * 100)}%`
                : '0%',
            }"
          />
        </div>
        <div class="flex flex-col items-center gap-1">
          <span class="text-xs text-[var(--ui-text)]">Output</span>
          <div
            class="flex h-12 w-12 cursor-pointer items-center justify-center rounded border-2 border-[var(--ui-border)] bg-black/30 hover:border-amber-500"
            @click="takeOutput"
          >
            <img
              v-if="output.type"
              :src="BLOCK_ICON[output.type]"
              :alt="getBlockDisplayName(output.type)"
              class="h-8 w-8 object-contain"
              @error="(e: Event) => ((e.target as HTMLImageElement).src = FALLBACK_ICON)"
            />
            <span
              v-if="output.type && output.count > 1"
              class="absolute bottom-0 right-0 text-xs text-white"
            >
              {{ output.count }}
            </span>
          </div>
          <button
            type="button"
            class="mt-1 text-xs text-amber-400 hover:underline"
            @click="takeOutput"
          >
            Take
          </button>
        </div>
      </div>
      <p class="mt-2 text-xs text-[var(--ui-text)] opacity-80">
        Click input or fuel slot with an item in hand to put one in. Click output to take.
      </p>
    </div>
  </div>
</template>

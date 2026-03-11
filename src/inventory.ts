/**
 * Authoritative inventory state: hotbar (0–8), main inventory (9–35), crafting grid (36–39).
 * game-hotbar.ts is a thin facade over slots 0–8.
 */
import type { BlockType } from './types'
import {
  MAX_STACK_SIZE,
  HOTBAR_SLOTS,
  MAIN_INVENTORY_SLOTS,
  CRAFTING_GRID_2X2,
  TOTAL_PERSISTENT_SLOTS,
} from './constants'
import { matchRecipe2x2, getConsumeAmountsForCraft } from './recipes'

export const INVENTORY_SLOT_COUNT = HOTBAR_SLOTS + MAIN_INVENTORY_SLOTS + CRAFTING_GRID_2X2

/** First index of hotbar (0). */
export const HOTBAR_START = 0
/** First index of main inventory (9). */
export const MAIN_INVENTORY_START = HOTBAR_SLOTS
/** First index of 2×2 crafting grid (36). */
export const CRAFTING_START = HOTBAR_SLOTS + MAIN_INVENTORY_SLOTS

export interface InventorySlot {
  type: BlockType | null
  count: number
}

function emptySlot(): InventorySlot {
  return { type: null, count: 0 }
}

const slots: InventorySlot[] = Array.from({ length: INVENTORY_SLOT_COUNT }, emptySlot)

let onInventoryChange: (() => void) | null = null

/** Registers or clears the callback invoked whenever inventory slots change. */
export function setOnInventoryChange(cb: (() => void) | null): void {
  onInventoryChange = cb
}

function notify(): void {
  onInventoryChange?.()
}

/** Returns a copy of the slot at index (0-based). */
export function getSlot(index: number): InventorySlot {
  if (index < 0 || index >= INVENTORY_SLOT_COUNT) return emptySlot()
  const s = slots[index]
  return { type: s.type, count: s.count }
}

/** Sets slot at index. Clamps count to 0..MAX_STACK_SIZE; clears type if count 0. */
export function setSlot(index: number, type: BlockType | null, count: number): void {
  if (index < 0 || index >= INVENTORY_SLOT_COUNT) return
  const c = Math.max(0, Math.min(MAX_STACK_SIZE, Math.floor(count)))
  if (c <= 0) {
    slots[index] = emptySlot()
  } else {
    slots[index] = { type: type ?? null, count: c }
  }
  notify()
}

/** Slots 0–8 (hotbar). */
export function getHotbarSlots(): InventorySlot[] {
  return slots.slice(HOTBAR_START, HOTBAR_START + HOTBAR_SLOTS).map((s) => ({ ...s }))
}

/** Slots 9–35 (main inventory, row-major). */
export function getMainInventorySlots(): InventorySlot[] {
  return slots
    .slice(MAIN_INVENTORY_START, MAIN_INVENTORY_START + MAIN_INVENTORY_SLOTS)
    .map((s) => ({ ...s }))
}

/** Slots 36–39 (2×2 crafting input, row-major). */
export function getCraftingSlots(): InventorySlot[] {
  return slots.slice(CRAFTING_START, CRAFTING_START + CRAFTING_GRID_2X2).map((s) => ({ ...s }))
}

/** All slots (0–39) for UI binding. */
export function getAllSlots(): InventorySlot[] {
  return slots.map((s) => ({ type: s.type, count: s.count }))
}

/** Adds item to inventory: stack in hotbar first, then main, then first empty in hotbar then main. */
export function addItem(type: BlockType, amount: number): void {
  let remaining = amount
  const tryStack = (start: number, end: number): void => {
    for (let i = start; i < end && remaining > 0; i++) {
      const s = slots[i]
      if (s.type === type && s.count < MAX_STACK_SIZE) {
        const add = Math.min(remaining, MAX_STACK_SIZE - s.count)
        s.count += add
        remaining -= add
      }
    }
  }
  const tryEmpty = (start: number, end: number): void => {
    for (let i = start; i < end && remaining > 0; i++) {
      const s = slots[i]
      if (s.count <= 0) {
        const add = Math.min(remaining, MAX_STACK_SIZE)
        slots[i] = { type, count: add }
        remaining -= add
      }
    }
  }
  tryStack(HOTBAR_START, HOTBAR_START + HOTBAR_SLOTS)
  tryStack(MAIN_INVENTORY_START, MAIN_INVENTORY_START + MAIN_INVENTORY_SLOTS)
  tryEmpty(HOTBAR_START, HOTBAR_START + HOTBAR_SLOTS)
  tryEmpty(MAIN_INVENTORY_START, MAIN_INVENTORY_START + MAIN_INVENTORY_SLOTS)
  if (remaining < amount) notify()
}

/** Consumes up to amount from slot; returns actual amount consumed. */
export function consumeFromSlot(index: number, amount: number): number {
  if (index < 0 || index >= INVENTORY_SLOT_COUNT || amount <= 0) return 0
  const s = slots[index]
  const take = Math.min(amount, s.count)
  if (take <= 0) return 0
  s.count -= take
  if (s.count <= 0) {
    slots[index] = emptySlot()
  }
  notify()
  return take
}

/**
 * Moves items between slots: swap if different type; merge stacks if same type (up to MAX_STACK_SIZE).
 * If amount is given, moves at most that many (for split); otherwise moves full stack.
 * Returns true if any change occurred.
 */
export function moveSlots(
  fromIndex: number,
  toIndex: number,
  amount?: number,
): boolean {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= INVENTORY_SLOT_COUNT || toIndex >= INVENTORY_SLOT_COUNT) {
    return false
  }
  const from = slots[fromIndex]
  const to = slots[toIndex]
  if (from.count <= 0) return false

  const moveCount = amount != null ? Math.min(amount, from.count) : from.count
  if (moveCount <= 0) return false

  if (to.count <= 0) {
    slots[toIndex] = { type: from.type, count: moveCount }
    from.count -= moveCount
    if (from.count <= 0) slots[fromIndex] = emptySlot()
    notify()
    return true
  }

  if (from.type === to.type) {
    const space = MAX_STACK_SIZE - to.count
    const actual = Math.min(moveCount, space)
    if (actual <= 0) return false
    to.count += actual
    from.count -= actual
    if (from.count <= 0) slots[fromIndex] = emptySlot()
    notify()
    return true
  }

  if (amount != null && amount < from.count) {
    return false
  }
  slots[fromIndex] = { type: to.type, count: to.count }
  slots[toIndex] = { type: from.type, count: from.count }
  notify()
  return true
}

/** Clears the 2×2 crafting grid (indices 36–39). */
export function clearCraftingGrid(): void {
  for (let i = CRAFTING_START; i < CRAFTING_START + CRAFTING_GRID_2X2; i++) {
    slots[i] = emptySlot()
  }
  notify()
}

/**
 * If the 2×2 crafting grid matches a recipe, consumes one set of ingredients and adds the result to inventory.
 * @returns true if a craft was performed.
 */
export function craftOne(): boolean {
  const gridSlots = slots.slice(CRAFTING_START, CRAFTING_START + CRAFTING_GRID_2X2)
  const gridTypes = gridSlots.map((s) => s.type)
  const matched = matchRecipe2x2(gridTypes)
  if (!matched) return false
  const amounts = getConsumeAmountsForCraft(matched.recipe, gridSlots)
  for (let i = 0; i < CRAFTING_GRID_2X2; i++) {
    if (amounts[i] > 0) consumeFromSlot(CRAFTING_START + i, amounts[i])
  }
  addItem(matched.result.type, matched.result.count)
  return true
}

/** Returns a snapshot of all persistent slots (hotbar + main) for save. */
export function getPersistentSlots(): InventorySlot[] {
  return slots.slice(0, TOTAL_PERSISTENT_SLOTS).map((s) => ({ type: s.type, count: s.count }))
}

/** Restores persistent slots (hotbar + main) from save; clears crafting grid. */
export function setPersistentSlots(snapshot: InventorySlot[]): void {
  const len = Math.min(snapshot.length, TOTAL_PERSISTENT_SLOTS)
  for (let i = 0; i < len; i++) {
    const s = snapshot[i]
    slots[i] =
      s && s.count > 0 && s.type
        ? { type: s.type, count: Math.min(s.count, MAX_STACK_SIZE) }
        : emptySlot()
  }
  for (let i = len; i < TOTAL_PERSISTENT_SLOTS; i++) {
    slots[i] = emptySlot()
  }
  clearCraftingGrid()
}

/** Initializes default hotbar + empty main (e.g. new game). Does not clear crafting. */
export function initDefaultInventory(): void {
  const defaultHotbar: { type: BlockType; count: number }[] = [
    { type: 'wood_sword', count: 1 },
    { type: 'grass', count: 1 },
    { type: 'dirt', count: 1 },
    { type: 'stone', count: 1 },
    { type: 'sand', count: 1 },
    { type: 'snow', count: 1 },
    { type: 'wood', count: 1 },
    { type: 'leaves', count: 1 },
    { type: 'torch', count: 5 },
  ]
  for (let i = 0; i < HOTBAR_SLOTS; i++) {
    const d = defaultHotbar[i]
    slots[i] = d ? { type: d.type, count: d.count } : emptySlot()
  }
  for (let i = MAIN_INVENTORY_START; i < MAIN_INVENTORY_START + MAIN_INVENTORY_SLOTS; i++) {
    slots[i] = emptySlot()
  }
  notify()
}

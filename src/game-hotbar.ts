/**
 * Hotbar (Minecraft-style block selection): 9 slots, selection index, inventory add.
 * Thin facade over inventory slots 0–8. Used by game.ts for placement, pickups, and UI sync.
 */
import type { BlockType } from './types'
import {
  getSlot,
  addItem,
  consumeFromSlot,
  HOTBAR_START,
  setOnInventoryChange,
} from './inventory'

const HOTBAR_SLOTS = 9
let selectedHotbarIndex = 0

/** Currently selected block type (for placement/building). Empty slot returns ''. */
export function getSelectedBlockType(): BlockType {
  const slot = getSlot(HOTBAR_START + selectedHotbarIndex)
  return slot.type ?? ''
}

/** Index of the currently selected hotbar slot (0–8). */
export function getSelectedHotbarIndex(): number {
  return selectedHotbarIndex
}

/** Update DOM slot selection state. */
export function updateHotbarSelection(): void {
  const slotEls = document.querySelectorAll('#hotbar .slot')
  slotEls.forEach((el, i) => {
    el.classList.toggle('selected', i === selectedHotbarIndex)
  })
}

/** Sets the selected hotbar slot by index (wraps 0–8) and updates DOM selection state. */
export function setHotbarIndex(index: number): void {
  selectedHotbarIndex = ((index % HOTBAR_SLOTS) + HOTBAR_SLOTS) % HOTBAR_SLOTS
  updateHotbarSelection()
}

/** Callback when hotbar changes (for UI sync). Receives blocks and counts for slots 0–8. */
let onHotbarChange: ((blocks: BlockType[], counts: number[]) => void) | null = null

function emitHotbarChange(): void {
  const blocks: BlockType[] = []
  const counts: number[] = []
  for (let i = 0; i < HOTBAR_SLOTS; i++) {
    const s = getSlot(HOTBAR_START + i)
    blocks.push(s.type ?? '')
    counts.push(s.count)
  }
  onHotbarChange?.(blocks, counts)
}

/** Registers or clears the callback invoked whenever hotbar blocks/counts or selection change. */
export function setOnHotbarChange(
  cb: ((blocks: BlockType[], counts: number[]) => void) | null,
): void {
  onHotbarChange = cb
}

/** Wires inventory change to hotbar callback so UI stays in sync. Call once at game init. */
export function attachHotbarToInventory(): void {
  setOnInventoryChange(emitHotbarChange)
}

/** Add a picked-up block to inventory (hotbar first, then main). Stacks up to MAX_STACK_SIZE. */
export function addBlockToInventory(blockType: BlockType): void {
  addItem(blockType, 1)
}

/** Notify UI of current hotbar state (e.g. after init or block place). */
export function notifyHotbarChange(): void {
  emitHotbarChange()
}

/** Current count in the selected slot. */
export function getSelectedSlotCount(): number {
  return getSlot(HOTBAR_START + selectedHotbarIndex).count
}

/** Consume one item from the selected slot. Returns true if consumed and notifies UI. */
export function consumeOneFromSelectedSlot(): boolean {
  const taken = consumeFromSlot(HOTBAR_START + selectedHotbarIndex, 1)
  return taken > 0
}

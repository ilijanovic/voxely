/**
 * Hotbar (Minecraft-style block selection): 9 slots, selection index, inventory add.
 * Used by game.ts for placement, pickups, and UI sync.
 */
import type { BlockType } from './types'
import { MAX_STACK_SIZE } from './constants'

/** Block types in the 9 hotbar slots (left to right). */
const HOTBAR_BLOCKS: BlockType[] = [
  'grass',
  'dirt',
  'stone',
  'sand',
  'snow',
  'wood',
  'leaves',
  'grass',
  'torch',
]

/** Count per hotbar slot (index matches HOTBAR_BLOCKS). */
const HOTBAR_COUNTS = [1, 1, 1, 1, 1, 1, 1, 1, 5] // Torch (slot 8) starts with 5

const HOTBAR_SLOTS = 9
let selectedHotbarIndex = 0

/** Currently selected block type (for placement/building). */
export function getSelectedBlockType(): BlockType {
  return HOTBAR_BLOCKS[selectedHotbarIndex]
}

export function getSelectedHotbarIndex(): number {
  return selectedHotbarIndex
}

/** Update DOM slot selection state. */
export function updateHotbarSelection(): void {
  const slots = document.querySelectorAll('#hotbar .slot')
  slots.forEach((el, i) => {
    el.classList.toggle('selected', i === selectedHotbarIndex)
  })
}

export function setHotbarIndex(index: number): void {
  selectedHotbarIndex = ((index % HOTBAR_SLOTS) + HOTBAR_SLOTS) % HOTBAR_SLOTS
  updateHotbarSelection()
}

/** Callback when hotbar changes (for UI sync). */
let onHotbarChange: ((blocks: BlockType[], counts: number[]) => void) | null = null

export function setOnHotbarChange(
  cb: ((blocks: BlockType[], counts: number[]) => void) | null,
): void {
  onHotbarChange = cb
}

/** Add a picked-up block to the hotbar. Stacks up to MAX_STACK_SIZE (64), then uses next empty slot. */
export function addBlockToInventory(blockType: BlockType): void {
  for (let i = 0; i < HOTBAR_SLOTS; i++) {
    if (HOTBAR_BLOCKS[i] === blockType && (HOTBAR_COUNTS[i] ?? 0) < MAX_STACK_SIZE) {
      HOTBAR_COUNTS[i]++
      onHotbarChange?.(HOTBAR_BLOCKS.slice(), HOTBAR_COUNTS.slice())
      return
    }
  }
  const empty = HOTBAR_COUNTS.findIndex((c) => c <= 0)
  if (empty >= 0) {
    HOTBAR_BLOCKS[empty] = blockType
    HOTBAR_COUNTS[empty] = 1
    onHotbarChange?.(HOTBAR_BLOCKS.slice(), HOTBAR_COUNTS.slice())
  }
}

/** Notify UI of current hotbar state (e.g. after init or block place). */
export function notifyHotbarChange(): void {
  onHotbarChange?.(HOTBAR_BLOCKS.slice(), HOTBAR_COUNTS.slice())
}

/** Current count in the selected slot. */
export function getSelectedSlotCount(): number {
  return HOTBAR_COUNTS[selectedHotbarIndex] ?? 0
}

/** Consume one item from the selected slot. Returns true if consumed and notifies UI. */
export function consumeOneFromSelectedSlot(): boolean {
  const count = HOTBAR_COUNTS[selectedHotbarIndex] ?? 0
  if (count <= 0) return false
  HOTBAR_COUNTS[selectedHotbarIndex]--
  onHotbarChange?.(HOTBAR_BLOCKS.slice(), HOTBAR_COUNTS.slice())
  return true
}

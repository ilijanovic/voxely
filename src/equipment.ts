/**
 * Player equipment slots (armor + main hand / off hand). Separate from inventory; persisted in save.
 */
import type { BlockType } from './types'
import type { EquipmentSlot } from './player/faction'
import { EQUIPMENT_SLOTS } from './player/faction'
import type { PlayerClass } from './player/faction'
import {
  canClassWearArmorType,
  canClassWieldWeaponType,
  isArmorSlot,
  isWeaponSlot,
} from './player/class-restrictions'
import { getArmorSlot, getArmorType, getWeaponType } from './block-registry'
import { getSlot, setSlot, consumeFromSlot, getFirstEmptyPersistentSlot } from './inventory'

export interface EquipmentSlotState {
  type: BlockType | null
  count: number
}

const slots: Map<EquipmentSlot, EquipmentSlotState> = new Map()

function emptySlot(): EquipmentSlotState {
  return { type: null, count: 0 }
}

/** Initialises all equipment slots to empty. Call on init or when no save. */
function init(): void {
  for (const slot of EQUIPMENT_SLOTS) {
    slots.set(slot, emptySlot())
  }
}

init()

let onEquipmentChange: (() => void) | null = null

/** Registers or clears the callback invoked when equipment slots change. */
export function setOnEquipmentChange(cb: (() => void) | null): void {
  onEquipmentChange = cb
}

function notify(): void {
  onEquipmentChange?.()
}

/**
 * Returns the current state of an equipment slot (copy).
 */
export function getEquipped(slot: EquipmentSlot): EquipmentSlotState {
  const s = slots.get(slot) ?? emptySlot()
  return { type: s.type, count: s.count }
}

/**
 * Sets an equipment slot. Use count 0 to clear. Count is clamped to 0 or 1 for equipment (no stacking in slots).
 */
export function setEquipped(slot: EquipmentSlot, type: BlockType | null, count: number): void {
  const c = count <= 0 ? 0 : 1
  if (c <= 0) {
    slots.set(slot, emptySlot())
  } else {
    slots.set(slot, { type: type ?? null, count: 1 })
  }
  notify()
}

/**
 * Returns a snapshot of all equipment slots for save. Order: helm, chest, legs, boots, mainHand, offHand.
 */
export function getEquipmentForSave(): Record<EquipmentSlot, EquipmentSlotState> {
  const out = {} as Record<EquipmentSlot, EquipmentSlotState>
  for (const slot of EQUIPMENT_SLOTS) {
    const s = slots.get(slot) ?? emptySlot()
    out[slot] = { type: s.type, count: s.count }
  }
  return out
}

/**
 * Restores equipment from save. Invalid types are skipped (slot left empty). Missing slots default to empty.
 * @param data - Saved equipment keyed by slot; validBlockTypes is used to reject unknown item ids.
 */
export function setEquipmentFromSave(
  data: Record<string, { type: BlockType | null; count: number }> | undefined,
  validBlockTypes?: Set<string>,
): void {
  const valid = validBlockTypes ?? new Set<string>()
  for (const slot of EQUIPMENT_SLOTS) {
    const entry = data?.[slot]
    if (entry && entry.type && valid.has(entry.type) && entry.count > 0) {
      slots.set(slot, { type: entry.type, count: 1 })
    } else {
      slots.set(slot, emptySlot())
    }
  }
  notify()
}

/**
 * Returns whether the given item type can be equipped in the given slot by the given class.
 * Uses block registry (armorType, armorSlot, weaponType) and class restrictions.
 */
export function canEquip(
  itemType: BlockType,
  slot: EquipmentSlot,
  playerClass: PlayerClass,
): boolean {
  const weaponType = getWeaponType(itemType)
  const armorType = getArmorType(itemType)
  const armorSlot = getArmorSlot(itemType)

  if (isWeaponSlot(slot)) {
    if (!weaponType) return false
    return canClassWieldWeaponType(playerClass, weaponType)
  }
  if (isArmorSlot(slot)) {
    if (!armorType || !armorSlot) return false
    if (armorSlot !== slot) return false
    return canClassWearArmorType(playerClass, armorType)
  }
  return false
}

/** Puts one item into the first empty persistent slot (for swap when equipping). */
function addItemToInventory(type: BlockType, count: number): void {
  const emptyIndex = getFirstEmptyPersistentSlot()
  if (emptyIndex >= 0) setSlot(emptyIndex, type, count)
}

/**
 * Tries to equip one item from the given inventory slot into the equipment slot.
 * If the equipment slot was filled, that item is moved to the first free inventory slot.
 * Returns true if the move was performed (item is valid and class can equip).
 */
export function tryEquipFromInventory(
  inventorySlotIndex: number,
  equipmentSlot: EquipmentSlot,
  playerClass: PlayerClass,
): boolean {
  const inv = getSlot(inventorySlotIndex)
  if (!inv.type || inv.count <= 0) return false
  if (!canEquip(inv.type, equipmentSlot, playerClass)) return false
  const current = getEquipped(equipmentSlot)
  consumeFromSlot(inventorySlotIndex, 1)
  setEquipped(equipmentSlot, inv.type, 1)
  if (current.type && current.count > 0) {
    addItemToInventory(current.type, 1)
  }
  return true
}

/**
 * Tries to unequip the item in the given equipment slot into the first free inventory slot.
 * Returns true if the item was moved; false if slot was empty or no free inventory slot.
 */
export function tryUnequipToInventory(equipmentSlot: EquipmentSlot): boolean {
  const eq = getEquipped(equipmentSlot)
  if (!eq.type || eq.count <= 0) return false
  const emptyIndex = getFirstEmptyPersistentSlot()
  if (emptyIndex < 0) return false
  setSlot(emptyIndex, eq.type, 1)
  setEquipped(equipmentSlot, null, 0)
  return true
}

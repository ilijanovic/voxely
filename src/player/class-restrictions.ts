/**
 * Per-class restrictions: which armor and weapon types a class can equip.
 */
import type { PlayerClass, ArmorType, WeaponType, ArmorSlot, EquipmentSlot } from './faction'

/** Allowed armor types per class. Warrior can wear cloth, leather, plate. */
const CLASS_ARMOR: Record<PlayerClass, readonly ArmorType[]> = {
  warrior: ['cloth', 'leather', 'plate'],
}

/** Allowed weapon types per class. Warrior can use sword (and later axe, mace). */
const CLASS_WEAPONS: Record<PlayerClass, readonly WeaponType[]> = {
  warrior: ['sword'],
}

/**
 * Returns whether the given class can equip the given armor type.
 */
export function canClassWearArmorType(playerClass: PlayerClass, armorType: ArmorType): boolean {
  return (CLASS_ARMOR[playerClass] as readonly string[]).includes(armorType)
}

/**
 * Returns whether the given class can wield the given weapon type.
 */
export function canClassWieldWeaponType(playerClass: PlayerClass, weaponType: WeaponType): boolean {
  return (CLASS_WEAPONS[playerClass] as readonly string[]).includes(weaponType)
}

/**
 * Returns whether the given slot is an armor slot (helm, chest, legs, boots).
 */
export function isArmorSlot(slot: EquipmentSlot): slot is ArmorSlot {
  return ['helm', 'chest', 'legs', 'boots'].includes(slot)
}

/**
 * Returns whether the given slot is a weapon slot (mainHand or offHand).
 */
export function isWeaponSlot(slot: EquipmentSlot): boolean {
  return slot === 'mainHand' || slot === 'offHand'
}

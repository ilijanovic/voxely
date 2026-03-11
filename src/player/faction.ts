/**
 * Player faction and class types (WoW-style, custom names).
 */

/** Playable factions (no WoW names). */
export type Faction = 'covenant' | 'legion'

/** Playable classes; warrior first, extend later (mage, etc.). */
export type PlayerClass = 'warrior'

/** All faction values for iteration/validation. */
export const ALL_FACTIONS: Faction[] = ['covenant', 'legion']

/** All class values for iteration/validation. */
export const ALL_CLASSES: PlayerClass[] = ['warrior']

/** Armor weight categories (cloth, leather, plate). */
export type ArmorType = 'cloth' | 'leather' | 'plate'

/** Armor slot on the character. */
export type ArmorSlot = 'helm' | 'chest' | 'legs' | 'boots'

/** Weapon categories (sword first; axe, mace later). */
export type WeaponType = 'sword'

/** All armor types. */
export const ARMOR_TYPES: ArmorType[] = ['cloth', 'leather', 'plate']

/** All armor slots. */
export const ARMOR_SLOTS: ArmorSlot[] = ['helm', 'chest', 'legs', 'boots']

/** All weapon types (extend when adding axes, maces). */
export const WEAPON_TYPES: WeaponType[] = ['sword']

/** Equipment slot: armor slots plus main hand and off hand. */
export type EquipmentSlot = ArmorSlot | 'mainHand' | 'offHand'

/** All equipment slots. */
export const EQUIPMENT_SLOTS: EquipmentSlot[] = [
  'helm',
  'chest',
  'legs',
  'boots',
  'mainHand',
  'offHand',
]

/** Default faction when loading old saves. */
export const DEFAULT_FACTION: Faction = 'covenant'

/** Default class when loading old saves. */
export const DEFAULT_CLASS: PlayerClass = 'warrior'

/** Display name for faction (UI). */
export function getFactionDisplayName(faction: Faction): string {
  return faction === 'covenant' ? 'Covenant' : 'Legion'
}

/** Display name for class (UI). */
export function getClassDisplayName(playerClass: PlayerClass): string {
  return playerClass === 'warrior' ? 'Warrior' : playerClass
}

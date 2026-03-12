/**
 * Key bindings – configurable at runtime from the options menu.
 * game.ts uses getKeyBinding(); the options UI reads/writes via getKeyBindings/setKeyBinding.
 * Values are persisted in localStorage.
 */

const STORAGE_KEY = 'voxel-key-settings'

export type KeyAction =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'sprint'
  | 'sneak'
  | 'toggleView'
  | 'place'
  | 'openMap'
  | 'hotbar1'
  | 'hotbar2'
  | 'hotbar3'
  | 'hotbar4'
  | 'hotbar5'
  | 'hotbar6'
  | 'hotbar7'
  | 'hotbar8'
  | 'hotbar9'
  | 'skill1'
  | 'skill2'

const defaultBindings: Record<KeyAction, string> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ControlLeft',
  sneak: 'ShiftLeft',
  toggleView: 'KeyV',
  place: 'KeyF',
  openMap: 'KeyM',
  hotbar1: 'Digit1',
  hotbar2: 'Digit2',
  hotbar3: 'Digit3',
  hotbar4: 'Digit4',
  hotbar5: 'Digit5',
  hotbar6: 'Digit6',
  hotbar7: 'Digit7',
  hotbar8: 'Digit8',
  hotbar9: 'Digit9',
  skill1: 'KeyR',
  skill2: 'KeyF',
}

const bindings: Record<KeyAction, string> = { ...defaultBindings }

function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw) as Record<string, string>
    for (const key of Object.keys(defaultBindings) as KeyAction[]) {
      if (typeof data[key] === 'string' && data[key].length > 0) {
        bindings[key] = data[key]
      }
    }
  } catch {
    // invalid data → keep defaults
  }
}

function saveToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...bindings }))
  } catch {
    // quota exceeded or disabled
  }
}

loadFromStorage()

export function getKeyBinding(action: KeyAction): string {
  return bindings[action]
}

export function setKeyBinding(action: KeyAction, code: string): void {
  bindings[action] = code
  saveToStorage()
}

export function getKeyBindings(): Record<KeyAction, string> {
  return { ...bindings }
}

export function resetKeyBindingsToDefaults(): void {
  for (const key of Object.keys(defaultBindings) as KeyAction[]) {
    bindings[key] = defaultBindings[key]
  }
  saveToStorage()
}

/** Human-readable label for UI. */
export const keyActionLabels: Record<KeyAction, string> = {
  forward: 'Forward',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  jump: 'Jump',
  sprint: 'Sprint',
  sneak: 'Sneak',
  toggleView: 'Toggle view (1st/3rd person)',
  place: 'Place block / torch',
  openMap: 'Map',
  hotbar1: 'Hotbar 1',
  hotbar2: 'Hotbar 2',
  hotbar3: 'Hotbar 3',
  hotbar4: 'Hotbar 4',
  hotbar5: 'Hotbar 5',
  hotbar6: 'Hotbar 6',
  hotbar7: 'Hotbar 7',
  hotbar8: 'Hotbar 8',
  hotbar9: 'Hotbar 9',
  skill1: 'Skill 1',
  skill2: 'Skill 2',
}

/** Override display names for modifier and special keys. Other codes use Key*/
const KEY_CODE_TO_DISPLAY: Record<string, string> = {
  Space: 'Space',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
}

/** Convert KeyboardEvent.code to a short display string (e.g. "W", "Space"). */
export function codeToDisplayName(code: string): string {
  const override = KEY_CODE_TO_DISPLAY[code]
  if (override !== undefined) return override
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  return code
}

export const keyActions: KeyAction[] = [
  'forward',
  'back',
  'left',
  'right',
  'jump',
  'sprint',
  'sneak',
  'toggleView',
  'place',
  'openMap',
  'hotbar1',
  'hotbar2',
  'hotbar3',
  'hotbar4',
  'hotbar5',
  'hotbar6',
  'hotbar7',
  'hotbar8',
  'hotbar9',
  'skill1',
  'skill2',
]

/**
 * Key bindings – configurable at runtime from the options menu.
 * game.ts uses getKeyBinding(); the options UI reads/writes via getKeyBindings/setKeyBinding.
 * Values are persisted in localStorage.
 */

const STORAGE_KEY = "voxel-key-settings";

export type KeyAction =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "jump"
  | "toggleView"
  | "hotbar1"
  | "hotbar2"
  | "hotbar3"
  | "hotbar4"
  | "hotbar5"
  | "hotbar6"
  | "hotbar7"
  | "hotbar8"
  | "hotbar9";

const defaultBindings: Record<KeyAction, string> = {
  forward: "KeyW",
  back: "KeyS",
  left: "KeyA",
  right: "KeyD",
  jump: "Space",
  toggleView: "KeyV",
  hotbar1: "Digit1",
  hotbar2: "Digit2",
  hotbar3: "Digit3",
  hotbar4: "Digit4",
  hotbar5: "Digit5",
  hotbar6: "Digit6",
  hotbar7: "Digit7",
  hotbar8: "Digit8",
  hotbar9: "Digit9",
};

const bindings: Record<KeyAction, string> = { ...defaultBindings };

function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as Record<string, string>;
    for (const key of Object.keys(defaultBindings) as KeyAction[]) {
      if (typeof data[key] === "string" && data[key].length > 0) {
        bindings[key] = data[key];
      }
    }
  } catch {
    // invalid data → keep defaults
  }
}

function saveToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...bindings }));
  } catch {
    // quota exceeded or disabled
  }
}

loadFromStorage();

export function getKeyBinding(action: KeyAction): string {
  return bindings[action];
}

export function setKeyBinding(action: KeyAction, code: string): void {
  bindings[action] = code;
  saveToStorage();
}

export function getKeyBindings(): Record<KeyAction, string> {
  return { ...bindings };
}

export function resetKeyBindingsToDefaults(): void {
  for (const key of Object.keys(defaultBindings) as KeyAction[]) {
    bindings[key] = defaultBindings[key];
  }
  saveToStorage();
}

/** Human-readable label for UI. */
export const keyActionLabels: Record<KeyAction, string> = {
  forward: "Vorwärts",
  back: "Rückwärts",
  left: "Links",
  right: "Rechts",
  jump: "Springen",
  toggleView: "Ansicht wechseln (1./3. Person)",
  hotbar1: "Hotbar 1",
  hotbar2: "Hotbar 2",
  hotbar3: "Hotbar 3",
  hotbar4: "Hotbar 4",
  hotbar5: "Hotbar 5",
  hotbar6: "Hotbar 6",
  hotbar7: "Hotbar 7",
  hotbar8: "Hotbar 8",
  hotbar9: "Hotbar 9",
};

/** Convert KeyboardEvent.code to a short display string (e.g. "W", "Space"). */
export function codeToDisplayName(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Space") return "Space";
  if (code === "ShiftLeft" || code === "ShiftRight") return "Shift";
  if (code === "ControlLeft" || code === "ControlRight") return "Strg";
  if (code === "AltLeft" || code === "AltRight") return "Alt";
  return code;
}

export const keyActions: KeyAction[] = [
  "forward",
  "back",
  "left",
  "right",
  "jump",
  "toggleView",
  "hotbar1",
  "hotbar2",
  "hotbar3",
  "hotbar4",
  "hotbar5",
  "hotbar6",
  "hotbar7",
  "hotbar8",
  "hotbar9",
];

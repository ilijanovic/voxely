export const DEFAULT_DOUBLE_TAP_JUMP_WINDOW_MS = 260

export interface FlyToggleInput {
  /** Current timestamp in ms (typically performance.now()). */
  nowMs: number
  /** Previous non-repeat jump keydown timestamp in ms, or 0 when unset. */
  lastJumpPressTimeMs: number
  /** True when player is grounded (on land). */
  grounded: boolean
  /** True when player is in water. */
  inWater: boolean
  /** True when the KeyboardEvent is a repeat. */
  isRepeat: boolean
  /** Current fly state. */
  isFlying: boolean
  /** Double tap window in ms. */
  doubleTapWindowMs: number
}

export interface FlyToggleResult {
  /** Updated fly state. */
  isFlying: boolean
  /** Updated last jump keydown timestamp in ms. */
  lastJumpPressTimeMs: number
  /** Whether fly toggled on this keydown. */
  toggled: boolean
}

/**
 * Determines whether Creative-like fly should toggle on a jump key press and updates the last-tap timestamp.
 * Fly toggles only on a second tap within the configured window while the player is airborne and not in water.
 */
export function computeFlyToggleFromJump(input: FlyToggleInput): FlyToggleResult {
  if (input.isRepeat) {
    return {
      isFlying: input.isFlying,
      lastJumpPressTimeMs: input.lastJumpPressTimeMs,
      toggled: false,
    }
  }

  const withinWindow =
    input.lastJumpPressTimeMs > 0 &&
    input.nowMs - input.lastJumpPressTimeMs < input.doubleTapWindowMs

  const canToggle = !input.inWater && !input.grounded && withinWindow
  const nextFlying = canToggle ? !input.isFlying : input.isFlying

  return {
    isFlying: nextFlying,
    lastJumpPressTimeMs: input.nowMs,
    toggled: canToggle,
  }
}


import { describe, it, expect } from 'vitest'
import { computeFlyToggleFromJump, DEFAULT_DOUBLE_TAP_JUMP_WINDOW_MS } from './fly'

const NOW_MS = 1000
const PREV_MS = NOW_MS - 100
const OUTSIDE_PREV_MS = NOW_MS - (DEFAULT_DOUBLE_TAP_JUMP_WINDOW_MS + 1)

describe('computeFlyToggleFromJump', () => {
  it('toggles only on second tap within window while airborne', () => {
    const r = computeFlyToggleFromJump({
      nowMs: NOW_MS,
      lastJumpPressTimeMs: PREV_MS,
      grounded: false,
      inWater: false,
      isRepeat: false,
      isFlying: false,
      doubleTapWindowMs: DEFAULT_DOUBLE_TAP_JUMP_WINDOW_MS,
    })
    expect(r.toggled).toBe(true)
    expect(r.isFlying).toBe(true)
    expect(r.lastJumpPressTimeMs).toBe(NOW_MS)
  })

  it('does not toggle when outside double tap window', () => {
    const r = computeFlyToggleFromJump({
      nowMs: NOW_MS,
      lastJumpPressTimeMs: OUTSIDE_PREV_MS,
      grounded: false,
      inWater: false,
      isRepeat: false,
      isFlying: false,
      doubleTapWindowMs: DEFAULT_DOUBLE_TAP_JUMP_WINDOW_MS,
    })
    expect(r.toggled).toBe(false)
    expect(r.isFlying).toBe(false)
    expect(r.lastJumpPressTimeMs).toBe(NOW_MS)
  })

  it('does not toggle when grounded', () => {
    const r = computeFlyToggleFromJump({
      nowMs: NOW_MS,
      lastJumpPressTimeMs: PREV_MS,
      grounded: true,
      inWater: false,
      isRepeat: false,
      isFlying: false,
      doubleTapWindowMs: DEFAULT_DOUBLE_TAP_JUMP_WINDOW_MS,
    })
    expect(r.toggled).toBe(false)
    expect(r.isFlying).toBe(false)
  })

  it('does not toggle in water', () => {
    const r = computeFlyToggleFromJump({
      nowMs: NOW_MS,
      lastJumpPressTimeMs: PREV_MS,
      grounded: false,
      inWater: true,
      isRepeat: false,
      isFlying: false,
      doubleTapWindowMs: DEFAULT_DOUBLE_TAP_JUMP_WINDOW_MS,
    })
    expect(r.toggled).toBe(false)
    expect(r.isFlying).toBe(false)
  })

  it('ignores repeat events (does not update last tap time)', () => {
    const r = computeFlyToggleFromJump({
      nowMs: NOW_MS,
      lastJumpPressTimeMs: PREV_MS,
      grounded: false,
      inWater: false,
      isRepeat: true,
      isFlying: false,
      doubleTapWindowMs: DEFAULT_DOUBLE_TAP_JUMP_WINDOW_MS,
    })
    expect(r.toggled).toBe(false)
    expect(r.isFlying).toBe(false)
    expect(r.lastJumpPressTimeMs).toBe(PREV_MS)
  })
})


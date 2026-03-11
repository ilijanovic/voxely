/**
 * Pure helpers for terrain generation (no THREE, no DOM).
 * Used by pipeline, biome selection, and main-thread terrain sampling.
 */

/** Returns a deterministic RNG in [0, 1); same seed yields same sequence. */
export function makeSeededRandom(seed: number) {
  return function () {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
}

/** Hermite smoothstep between a and b; returns 0 for x <= a, 1 for x >= b, smooth in between. */
export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Clamps x to [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

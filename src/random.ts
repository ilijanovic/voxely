import seedrandom from 'seedrandom'

let _rng: (() => number) | null = null

/**
 * Initializes the gameplay RNG with a deterministic seed.
 * Call once during startup (e.g. from `initGame`) to make random-based gameplay stable per world seed.
 *
 * @param seed - Deterministic seed for this session
 */
export function initGameplayRng(seed: number): void {
  _rng = seedrandom(String(seed))
}

/**
 * Returns the active RNG function.
 * @throws When called before `initGameplayRng`.
 */
function getRng(): () => number {
  if (_rng == null) {
    throw new Error('Gameplay RNG not initialized. Call initGameplayRng(seed) first.')
  }
  return _rng
}

/**
 * Returns a random float in [min, max).
 *
 * @param min - Inclusive lower bound
 * @param max - Exclusive upper bound
 * @returns Random float in [min, max)
 */
export function randomFloat(min = 0, max = 1): number {
  const rng = getRng()
  return min + rng() * (max - min)
}

/**
 * Returns a random integer in [min, max] (inclusive).
 *
 * @param min - Inclusive lower bound
 * @param max - Inclusive upper bound
 * @returns Random integer in [min, max]
 */
export function randomInt(min: number, max: number): number {
  const rng = getRng()
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  return lo + Math.floor(rng() * (hi - lo + 1))
}


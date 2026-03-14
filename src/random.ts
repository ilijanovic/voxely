import seedrandom from 'seedrandom'

/**
 * Shared RNG utilities for gameplay systems (loot, drops, AI, effects).
 * All deterministic gameplay randomness should go through this module instead of Math.random.
 */

let gameplayRng: seedrandom.PRNG | null = null

/**
 * Initializes the global gameplay RNG with a numeric seed.
 *
 * @param seed - Seed used to derive the gameplay RNG sequence
 */
export function initGameplayRng(seed: number) {
  gameplayRng = seedrandom(String(seed))
}

/**
 * Returns the global gameplay RNG, initializing it lazily with a default seed
 * when not yet configured. This keeps non-seeded callers functional while allowing
 * the game to provide a world seed via initGameplayRng.
 *
 * @returns PRNG instance for gameplay use
 */
export function getGameplayRng(): seedrandom.PRNG {
  if (!gameplayRng) {
    gameplayRng = seedrandom()
  }
  return gameplayRng
}

/**
 * Returns a float in [0, 1) from the gameplay RNG.
 *
 * @returns Random float in [0, 1)
 */
export function randomFloat(): number {
  return getGameplayRng()()
}

/**
 * Returns an integer in the inclusive [min, max] range from the gameplay RNG.
 *
 * @param min - Inclusive lower bound
 * @param max - Inclusive upper bound
 * @returns Random integer in [min, max]
 */
export function randomInt(min: number, max: number): number {
  const a = Math.min(min, max)
  const b = Math.max(min, max)
  const span = b - a + 1
  const idx = Math.floor(getGameplayRng()() * span)
  return a + Math.min(idx, span - 1)
}


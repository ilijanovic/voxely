/**
 * Global weather state: clear or rain. Drives rain particles and future thunder/storm.
 * Transitions randomly so rain comes and goes (Minecraft-style).
 */

export type WeatherState = 'clear' | 'rain'

let current: WeatherState = 'clear'
let timeUntilNextTransition = 60 + Math.random() * 60

/** Minimum seconds between weather transitions. */
const MIN_TRANSITION_INTERVAL = 60
/** Maximum seconds between weather transitions. */
const MAX_TRANSITION_INTERVAL = 120
/** Probability (0–1) that next weather is rain when transitioning. */
const RAIN_CHANCE = 0.3

/**
 * Returns the current weather state.
 */
export function getWeather(): WeatherState {
  return current
}

/**
 * Sets weather (e.g. for debug /rain command).
 */
export function setWeather(state: WeatherState): void {
  current = state
}

/**
 * Updates weather; call every frame with dt. Rolls for transition when timer expires.
 */
export function updateWeather(dt: number): void {
  timeUntilNextTransition -= dt
  if (timeUntilNextTransition > 0) return
  timeUntilNextTransition =
    MIN_TRANSITION_INTERVAL + Math.random() * (MAX_TRANSITION_INTERVAL - MIN_TRANSITION_INTERVAL)
  current = Math.random() < RAIN_CHANCE ? 'rain' : 'clear'
}

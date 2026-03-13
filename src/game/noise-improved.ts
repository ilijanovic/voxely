/**
 * Wrapper around Three.js ImprovedNoise (Ken Perlin 2002) for use in game code.
 * Terrain pipeline stays THREE-free; this module is only used where THREE is already loaded.
 */
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js'

/** Coordinate offset scale for seed-based variation; different seeds yield different patterns. */
const SEED_OFFSET_SCALE = 1e6

const improvedNoise = new ImprovedNoise()

/**
 * 2D slice of ImprovedNoise at z = 0. Value range is approximately [-1, 1].
 * Not seedable; same inputs always produce the same output.
 */
export function noise2D(x: number, z: number): number {
  return improvedNoise.noise(x, z, 0)
}

/**
 * Seedable 2D noise via coordinate offset. Same (x, z, seed) always returns the same value.
 * Value range is approximately [-1, 1].
 */
export function noise2DSeeded(x: number, z: number, seed: number): number {
  const ox = seed * SEED_OFFSET_SCALE
  const oz = (seed * 0.001) % 256
  return improvedNoise.noise(x + ox, z, oz)
}

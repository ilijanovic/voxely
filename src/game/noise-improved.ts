import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js'

const _improved = new ImprovedNoise()

/**
 * Computes 2D ImprovedNoise (Perlin) at (x, z) with y=0.
 * Output is approximately in [-1, 1].
 *
 * @param x - World-space X (already scaled by caller)
 * @param z - World-space Z (already scaled by caller)
 * @returns Noise value in roughly [-1, 1]
 */
export function noise2D(x: number, z: number): number {
  return _improved.noise(x, 0, z)
}

/**
 * Computes 2D ImprovedNoise (Perlin) at (x, z) with a deterministic seed offset.
 * This is used as a drop-in alternative to simplex noise for certain channels.
 *
 * Note: ImprovedNoise itself is deterministic for a given input, so we incorporate a seed
 * by shifting the input domain in a stable way.
 *
 * @param x - World-space X (already scaled by caller)
 * @param z - World-space Z (already scaled by caller)
 * @param seed - Deterministic seed to decorrelate channels
 * @returns Noise value in roughly [-1, 1]
 */
export function noise2DSeeded(x: number, z: number, seed: number): number {
  const sx = x + seed * 0.0001
  const sz = z - seed * 0.00013
  return _improved.noise(sx, 0, sz)
}


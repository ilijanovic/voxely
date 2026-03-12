import type { Biome } from './types'

export type GetBlockAtFn = (
  bx: number,
  by: number,
  bz: number,
) => import('./types').BlockType | 'air' | null

export type GetSurfaceYFn = (x: number, z: number) => number

export type GetBiomeFn = (x: number, z: number) => Biome

/** Block light level 0–15 at (bx, by, bz). Used for hostile mob spawn (spawn only in dark). */
export type GetBlockLightAtFn = (bx: number, by: number, bz: number) => number

export interface WorldApi {
  getBlockAt: GetBlockAtFn
  getSurfaceY: GetSurfaceYFn
  getColumnSurfaceY: GetSurfaceYFn
  getBiome: GetBiomeFn
  /** Optional: block light at position (0–15). When set, hostile spawn uses it (spawn only when light <= threshold). */
  getBlockLightAt?: GetBlockLightAtFn
}

let worldApi: WorldApi | null = null

export function setWorldApi(api: WorldApi): void {
  worldApi = api
}

export function getWorldApi(): WorldApi {
  if (!worldApi) throw new Error('WorldApi not set – init game first')
  return worldApi
}

import type { Biome } from './types'

export type GetBlockAtFn = (
  bx: number,
  by: number,
  bz: number,
) => import('./types').BlockType | 'air' | null

export type GetSurfaceYFn = (x: number, z: number) => number

export type GetBiomeFn = (x: number, z: number) => Biome

export interface WorldApi {
  getBlockAt: GetBlockAtFn
  getSurfaceY: GetSurfaceYFn
  getColumnSurfaceY: GetSurfaceYFn
  getBiome: GetBiomeFn
}

let worldApi: WorldApi | null = null

export function setWorldApi(api: WorldApi): void {
  worldApi = api
}

export function getWorldApi(): WorldApi {
  if (!worldApi) throw new Error('WorldApi not set – init game first')
  return worldApi
}

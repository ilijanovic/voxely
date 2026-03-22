import type { BlockType } from '../../types'

/**
 * Block types rendered as "cross" (two intersecting quads) instead of full cubes.
 * This is used for tall grass, ferns, dead bushes, and similar thin foliage.
 */
export const CROSS_GEOMETRY_BLOCK_TYPES: readonly BlockType[] = [
  'cactus_flower',
  'dandelion',
  'poppy',
  'tulip_red',
  'tulip_orange',
  'tulip_white',
  'tulip_pink',
  'oxeye_daisy',
  'cornflower',
  'azure_bluet',
  'allium',
  'lily_of_the_valley',
  'blue_orchid',
  'tall_grass',
  'fern',
  'large_fern',
  'brown_mushroom',
  'red_mushroom',
  'lily_pad',
  'dead_bush',
  'seagrass',
  'sea_pickle',
  'kelp',
  'sugar_cane',
  'pink_petals',
  'sweet_berry_bush',
  'bamboo',
  'vine',
] as const


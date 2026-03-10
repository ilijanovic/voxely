/**
 * Biome registry: single source of truth for biome definitions.
 * Exports climate-based land biome selection and compatibility helpers.
 */
import type { Biome } from "../../types";
import type {
  BiomeDefinition,
  ClimateBounds,
  MultiNoise6Point,
  MultiNoiseSelector6D,
} from "./types";
import { desertDefinition } from "./desert";
import { oceanDefinition } from "./ocean";
import { plainsDefinition } from "./plains";
import { savannaDefinition } from "./savanna";
import { forestDefinition } from "./forest";
import { jungleDefinition } from "./jungle";
import { mountainDefinition } from "./mountain";
import { snowDefinition } from "./snow";
import { meadowDefinition } from "./meadow";
import { groveDefinition } from "./grove";
import { snowySlopesDefinition } from "./snowy_slopes";
import { stonyPeaksDefinition } from "./stony_peaks";
import { frozenPeaksDefinition } from "./frozen_peaks";
import { jaggedPeaksDefinition } from "./jagged_peaks";
import { cherryGroveDefinition } from "./cherry_grove";
import { windsweptHillsDefinition } from "./windswept_hills";
import { windsweptGravellyHillsDefinition } from "./windswept_gravelly_hills";
import { windsweptForestDefinition } from "./windswept_forest";

export const BIOME_REGISTRY: Record<Biome, BiomeDefinition> = {
  plains: plainsDefinition,
  ocean: oceanDefinition,
  desert: desertDefinition,
  savanna: savannaDefinition,
  forest: forestDefinition,
  jungle: jungleDefinition,
  mountain: mountainDefinition,
  snow: snowDefinition,
  meadow: meadowDefinition,
  grove: groveDefinition,
  snowy_slopes: snowySlopesDefinition,
  stony_peaks: stonyPeaksDefinition,
  frozen_peaks: frozenPeaksDefinition,
  jagged_peaks: jaggedPeaksDefinition,
  cherry_grove: cherryGroveDefinition,
  windswept_hills: windsweptHillsDefinition,
  windswept_gravelly_hills: windsweptGravellyHillsDefinition,
  windswept_forest: windsweptForestDefinition,
};

/**
 * Base land biomes that have climate bounds.
 * Ocean is selected by continentalness in terrain sampling/generation, not by climate.
 */
const BASE_LAND_BIOMES: Biome[] = [
  "desert",
  "plains",
  "savanna",
  "forest",
  "jungle",
  "mountain",
  "snow",
];

const MULTI_NOISE_KEYS: Array<keyof MultiNoise6Point> = [
  "continentalness",
  "erosion",
  "temperature",
  "humidity",
  "weirdness",
  "y",
];

function distSqMultiNoise(
  query: MultiNoise6Point,
  selector: MultiNoiseSelector6D
): number {
  let d = 0;
  for (const k of MULTI_NOISE_KEYS) {
    const w = selector.weights?.[k] ?? 1;
    const diff = query[k] - selector.center[k];
    d += w * diff * diff;
  }
  return d;
}

function distSq(
  temp: number,
  humidity: number,
  c: ClimateBounds
): number {
  const tMid = (c.tempMin + c.tempMax) / 2;
  const hMid = (c.humidityMin + c.humidityMax) / 2;
  return (temp - tMid) ** 2 + (humidity - hMid) ** 2;
}

/**
 * Select a land biome from 2D climate.
 * Uses nearest climate center so that low temperature => snow,
 * high temperature + low humidity => desert, etc.
 */
export function getLandBiomeByClimate(temp: number, humidity: number): Biome {
  let best: Biome = "plains";
  let bestD = Infinity;
  for (const b of BASE_LAND_BIOMES) {
    const def = BIOME_REGISTRY[b];
    if (!def.climate) continue;
    const d = distSq(temp, humidity, def.climate);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/**
 * Backward-compatible alias kept for existing call sites/tests.
 * Returns land biomes only.
 */
export function getBiomeByClimate(temp: number, humidity: number): Biome {
  return getLandBiomeByClimate(temp, humidity);
}

/**
 * Select a biome by nearest multi-noise center in 6D.
 * Only considers biomes that have `multiNoise` defined.
 *
 * Note: This does not replace `getLandBiomeByClimate()` yet; call sites can opt-in
 * for specific selections (e.g. peak variants).
 */
export function getBiomeByMultiNoise(point: MultiNoise6Point): Biome {
  let best: Biome = "plains";
  let bestD = Infinity;
  for (const [b, def] of Object.entries(BIOME_REGISTRY) as Array<
    [Biome, BiomeDefinition]
  >) {
    if (!def.multiNoise) continue;
    const d = distSqMultiNoise(point, def.multiNoise);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

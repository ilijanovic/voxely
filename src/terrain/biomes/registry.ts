/**
 * Biome registry: single source of truth for biome definitions and climate-based selection.
 * Exports BIOME_REGISTRY and getBiomeByClimate(temp, humidity) for the pipeline.
 */
import type { Biome } from "../../types";
import type { BiomeDefinition, ClimateBounds } from "./types";
import { desertDefinition } from "./desert";
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

/** Base biomes that have climate bounds (used for getBiomeByClimate). */
const BASE_BIOMES: Biome[] = [
  "desert",
  "plains",
  "savanna",
  "forest",
  "jungle",
  "mountain",
  "snow",
];

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
 * Select base biome from 2D climate. Uses nearest climate center so that
 * low temperature => snow, high temp + low humidity => desert, etc.
 */
export function getBiomeByClimate(temp: number, humidity: number): Biome {
  let best: Biome = "plains";
  let bestD = Infinity;
  for (const b of BASE_BIOMES) {
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

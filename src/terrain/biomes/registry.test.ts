/**
 * Registry tests: every Biome must have terrain params and layer config.
 * When adding a new biome: add to Biome in types.ts, add biomes/<name>.ts, register here and in index.
 */
import { describe, it, expect } from "vitest";
import type { Biome } from "../../types";
import { BIOME_TERRAIN, BIOME_LAYERS } from "./index";

const ALL_BIOMES: Biome[] = [
  "plains",
  "desert",
  "savanna",
  "forest",
  "jungle",
  "mountain",
  "snow",
  "meadow",
  "grove",
  "snowy_slopes",
  "stony_peaks",
  "frozen_peaks",
  "jagged_peaks",
  "cherry_grove",
  "windswept_hills",
  "windswept_gravelly_hills",
  "windswept_forest",
];

describe("BIOME_TERRAIN", () => {
  it("has an entry for every Biome", () => {
    for (const biome of ALL_BIOMES) {
      expect(BIOME_TERRAIN[biome], `missing BIOME_TERRAIN for ${biome}`).toBeDefined();
    }
  });

  it("has no extra keys beyond Biome", () => {
    const terrainKeys = Object.keys(BIOME_TERRAIN) as Biome[];
    expect(terrainKeys.sort()).toEqual([...ALL_BIOMES].sort());
  });

  it("each entry has required TerrainParams fields", () => {
    for (const biome of ALL_BIOMES) {
      const t = BIOME_TERRAIN[biome];
      expect(t, biome).toBeDefined();
      expect(typeof t.baseOffset).toBe("number");
      expect(typeof t.detailAmp).toBe("number");
      expect(typeof t.detailFreq).toBe("number");
      expect(typeof t.flatness).toBe("number");
      expect(typeof t.mountainAllowed).toBe("boolean");
    }
  });
});

describe("BIOME_LAYERS", () => {
  it("has an entry for every Biome", () => {
    for (const biome of ALL_BIOMES) {
      expect(BIOME_LAYERS[biome], `missing BIOME_LAYERS for ${biome}`).toBeDefined();
    }
  });

  it("has no extra keys beyond Biome", () => {
    const layerKeys = Object.keys(BIOME_LAYERS) as Biome[];
    expect(layerKeys.sort()).toEqual([...ALL_BIOMES].sort());
  });

  it("each entry has valid LayerConfig", () => {
    for (const biome of ALL_BIOMES) {
      const layers = BIOME_LAYERS[biome];
      expect(layers, biome).toBeDefined();
      expect(typeof layers.surface).toBe("string");
      expect(layers.surface.length).toBeGreaterThan(0);
      expect(typeof layers.subsurface).toBe("string");
      expect(layers.subsurface.length).toBeGreaterThan(0);
      expect(Number.isInteger(layers.subsurfaceDepth)).toBe(true);
      expect(layers.subsurfaceDepth).toBeGreaterThanOrEqual(0);
    }
  });
});

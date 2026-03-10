import { describe, it, expect } from "vitest";
import { createTerrainSampling } from "./terrain-sampling";
import type { Biome } from "./types";

const ALL_BIOMES: Biome[] = [
  "plains",
  "ocean",
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

describe("createTerrainSampling().getBiomeBlend", () => {
  it("is deterministic for same seed and position", () => {
    const a = createTerrainSampling(123);
    const b = createTerrainSampling(123);
    const p1 = a.getBiomeBlend(100, -50);
    const p2 = b.getBiomeBlend(100, -50);
    expect(p1).toEqual(p2);
  });

  it("returns valid biomes and t in [0,1]", () => {
    const s = createTerrainSampling(1);
    for (let x = -200; x <= 200; x += 40) {
      for (let z = -200; z <= 200; z += 40) {
        const out = s.getBiomeBlend(x, z);
        expect(ALL_BIOMES).toContain(out.primary);
        expect(ALL_BIOMES).toContain(out.secondary);
        expect(out.t).toBeGreaterThanOrEqual(0);
        expect(out.t).toBeLessThanOrEqual(1);
      }
    }
  });

  it("finds at least one coastal blend (ocean->land) in a bounded scan", () => {
    const s = createTerrainSampling(7);
    let found = false;
    for (let x = -800; x <= 800; x += 40) {
      for (let z = -800; z <= 800; z += 40) {
        const out = s.getBiomeBlend(x, z);
        if (out.primary === "ocean" && out.secondary !== "ocean") {
          expect(out.t).toBeGreaterThan(0);
          expect(out.t).toBeLessThan(1);
          found = true;
          break;
        }
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });
});


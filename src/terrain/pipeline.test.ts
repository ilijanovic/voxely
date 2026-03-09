/**
 * Smoke tests for the terrain pipeline: generator and payload shape.
 */
import { describe, it, expect } from "vitest";
import { createChunkGenerator } from "./index";
import { getBiomeByClimate } from "./biomes";

describe("createChunkGenerator", () => {
  it("returns generateChunkData, getHeight, getResolvedBiome", () => {
    const gen = createChunkGenerator(12345);
    expect(typeof gen.generateChunkData).toBe("function");
    expect(typeof gen.getHeight).toBe("function");
    expect(typeof gen.getResolvedBiome).toBe("function");
  });

  it("generateChunkData returns valid ChunkDataPayload", () => {
    const gen = createChunkGenerator(1);
    const payload = gen.generateChunkData(0, 0, []);
    expect(payload.chunkX).toBe(0);
    expect(payload.chunkZ).toBe(0);
    expect(payload.heightmap).toBeDefined();
    expect(payload.heightmap.length).toBe(16);
    expect(payload.heightmap[0].length).toBe(16);
    expect(Array.isArray(payload.voxelMapEntries)).toBe(true);
    expect(payload.voxelMapEntries.length).toBeGreaterThan(0);
  });

  it("getHeight returns integer in world bounds", () => {
    const gen = createChunkGenerator(1);
    const h = gen.getHeight(0, 0);
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
  });
});

describe("getBiomeByClimate", () => {
  it("returns a base biome for any (temp, humidity) in [0,1]", () => {
    const base = getBiomeByClimate(0.5, 0.5);
    expect(["desert", "plains", "savanna", "forest", "jungle", "mountain", "snow"]).toContain(base);
  });

  it("low temp tends to snow", () => {
    const b = getBiomeByClimate(0.1, 0.4);
    expect(b).toBe("snow");
  });

  it("high temp low humidity tends to desert", () => {
    const b = getBiomeByClimate(0.9, 0.1);
    expect(b).toBe("desert");
  });
});

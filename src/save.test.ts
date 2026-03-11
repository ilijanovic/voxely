/**
 * Tests for save/load validation and roundtrip.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SAVE_KEY,
  SAVE_VERSION,
  VALID_BLOCK_TYPES,
  loadFromStorage,
  saveToStorage,
  type SaveData,
} from "./save";

const validPayload: SaveData = {
  saveVersion: SAVE_VERSION,
  worldSeed: 12345,
  player: {
    x: 0,
    y: 64,
    z: 0,
    rotationY: 0,
    lookPitch: 0,
  },
  removedBlocks: [],
  placedBlocks: [],
};

function createStorageMock(initialStore: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initialStore };
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    setGetItem: (value: string | null) => {
      if (value === null) delete store[SAVE_KEY];
      else store[SAVE_KEY] = value;
    },
  };
}

describe("loadFromStorage", () => {
  let mock: ReturnType<typeof createStorageMock>;

  beforeEach(() => {
    mock = createStorageMock();
    vi.stubGlobal("localStorage", mock);
  });

  it("returns null when nothing stored", () => {
    expect(loadFromStorage()).toBe(null);
  });

  it("returns null for invalid JSON", () => {
    mock.setGetItem("not json");
    expect(loadFromStorage()).toBe(null);
  });

  it("returns null when saveVersion > SAVE_VERSION", () => {
    mock.setGetItem(JSON.stringify({ ...validPayload, saveVersion: SAVE_VERSION + 1 }));
    expect(loadFromStorage()).toBe(null);
  });

  it("returns null when saveVersion < 1", () => {
    mock.setGetItem(JSON.stringify({ ...validPayload, saveVersion: 0 }));
    expect(loadFromStorage()).toBe(null);
  });

  it("returns null when player is missing", () => {
    mock.setGetItem(JSON.stringify({ ...validPayload, player: undefined }));
    expect(loadFromStorage()).toBe(null);
  });

  it("accepts valid payload with saveVersion 1", () => {
    const data = { ...validPayload, saveVersion: 1 };
    mock.setGetItem(JSON.stringify(data));
    expect(loadFromStorage()).toEqual(data);
  });

  it("accepts valid payload with saveVersion 2", () => {
    mock.setGetItem(JSON.stringify(validPayload));
    expect(loadFromStorage()).toEqual(validPayload);
  });
});

describe("saveToStorage and loadFromStorage roundtrip", () => {
  beforeEach(() => {
    const mock = createStorageMock();
    vi.stubGlobal("localStorage", mock);
  });

  it("includes grass_snow in VALID_BLOCK_TYPES (regression)", () => {
    expect(VALID_BLOCK_TYPES.has("grass_snow")).toBe(true);
    expect(VALID_BLOCK_TYPES.has("__not_a_real_block__")).toBe(false);
  });

  it("roundtrips valid SaveData", () => {
    const data: SaveData = {
      ...validPayload,
      placedBlocks: [{ x: 1, y: 65, z: 1, type: "grass" }],
      dayTime: 0.5,
    };
    saveToStorage(data);
    expect(loadFromStorage()).toEqual(data);
  });

  it("roundtrips SaveData with grass_snow placed block", () => {
    const data: SaveData = {
      ...validPayload,
      placedBlocks: [{ x: 2, y: 65, z: 2, type: "grass_snow" }],
    };
    saveToStorage(data);
    expect(loadFromStorage()).toEqual(data);
  });
});

# Changelog

## v0.0.9

[compare changes](https://github.com/ilijanovic/voxely/compare/v0.0.7...v0.0.9)

### 🚀 Enhancements

- Add quests, loot tables, world areas, and player systems ([4ed879b7](https://github.com/ilijanovic/voxely/commit/4ed879b7))
- **terrain:** Add pipeline stages, vegetation features, creature zones and quest updates ([d205d202](https://github.com/ilijanovic/voxely/commit/d205d202))
- **game:** Add minecraft-like doors ([b8d112dc](https://github.com/ilijanovic/voxely/commit/b8d112dc))
- **terrain:** Refine worldgen, quests, and docs ([7ae2b8d1](https://github.com/ilijanovic/voxely/commit/7ae2b8d1))
- Ore features, entity spawn and meshes, recipe and loot updates ([c4ce1281](https://github.com/ilijanovic/voxely/commit/c4ce1281))
- **terrain:** Add surface resolver and override with biome and stage updates ([ebaf25c3](https://github.com/ilijanovic/voxely/commit/ebaf25c3))
- Add flight and improved terrain noise ([c8ed0ee2](https://github.com/ilijanovic/voxely/commit/c8ed0ee2))
- **terrain:** Add beach, river, snowy_beach, stony_shore and river-shaping ([80caaa49](https://github.com/ilijanovic/voxely/commit/80caaa49))
- **terrain:** Add frozen_river, river-shaping and game-terrain tests ([8b017db5](https://github.com/ilijanovic/voxely/commit/8b017db5))
- **terrain,game:** Add carve overhang, badlands band noise, height shaping, and falling blocks ([3a278aae](https://github.com/ilijanovic/voxely/commit/3a278aae))
- **ui,game:** Add menu exit, offscreen full map renderer, and perf profiling ([9c9aec12](https://github.com/ilijanovic/voxely/commit/9c9aec12))

### 🩹 Fixes

- **torches:** Lean wall torch 45° from vertical instead of 90° ([be7e3858](https://github.com/ilijanovic/voxely/commit/be7e3858))
- **save:** Migrate legacy save only once so new worlds spawn randomly ([60ef9a29](https://github.com/ilijanovic/voxely/commit/60ef9a29))
- Udpate block registry ([a34a3b74](https://github.com/ilijanovic/voxely/commit/a34a3b74))

### 💅 Refactors

- **terrain:** Align biomes, add random module and terrain tests ([585f9ee0](https://github.com/ilijanovic/voxely/commit/585f9ee0))
- **entities:** Add entity-defs, spawn-rng, spawn-scene and update AI/spawn ([946b380b](https://github.com/ilijanovic/voxely/commit/946b380b))
- Terrain biomes, chunks, entities, quests and docs ([edc28af3](https://github.com/ilijanovic/voxely/commit/edc28af3))

### 🏡 Chore

- Change assets ([c03f2f7e](https://github.com/ilijanovic/voxely/commit/c03f2f7e))

### ❤️ Contributors

- Ilijanovic <ilija.marijanovic@gmx.at>

## v0.0.8

[compare changes](https://github.com/ilijanovic/voxely/compare/v0.0.7...v0.0.8)

### 🚀 Enhancements

- Add quests, loot tables, world areas, and player systems ([4ed879b7](https://github.com/ilijanovic/voxely/commit/4ed879b7))
- **terrain:** Add pipeline stages, vegetation features, creature zones and quest updates ([d205d202](https://github.com/ilijanovic/voxely/commit/d205d202))
- **game:** Add minecraft-like doors ([b8d112dc](https://github.com/ilijanovic/voxely/commit/b8d112dc))
- **crafting:** Minecraft-like crafting and inventory ([38b13348](https://github.com/ilijanovic/voxely/commit/38b13348))
- **quests:** Add talk/reach objectives and new WoW-style quests ([d8233297](https://github.com/ilijanovic/voxely/commit/d8233297))

### 🩹 Fixes

- **torches:** Lean wall torch 45° from vertical instead of 90° ([be7e3858](https://github.com/ilijanovic/voxely/commit/be7e3858))

### ❤️ Contributors

- Ilijanovic <ilija.marijanovic@gmx.at>

## v0.0.7

[compare changes](https://github.com/ilijanovic/voxely/compare/v0.0.6...v0.0.7)

### 🩹 Fixes

- **terrain:** Soften biome height edges at boundaries ([6208803a](https://github.com/ilijanovic/voxely/commit/6208803a))

### 📖 Documentation

- **terrain:** Add vanilla reference and align biome climate and cheese caves ([ec20b669](https://github.com/ilijanovic/voxely/commit/ec20b669))

### 🏡 Chore

- Sync blocks, entities, terrain, game, tests and docs ([8249181e](https://github.com/ilijanovic/voxely/commit/8249181e))

### ❤️ Contributors

- Ilijanovic <ilija.marijanovic@gmx.at>

## v0.0.6

[compare changes](https://github.com/ilijanovic/voxely/compare/v0.0.5...v0.0.6)

### 🚀 Enhancements

- **entities:** Add entity hit detection and extend game systems ([9981a74e](https://github.com/ilijanovic/voxely/commit/9981a74e))

### 💅 Refactors

- **terrain:** Surface stone height single source of truth ([1aa2c358](https://github.com/ilijanovic/voxely/commit/1aa2c358))

### 📖 Documentation

- Add JSDoc and clarify game systems ([49a20826](https://github.com/ilijanovic/voxely/commit/49a20826))
- Update README with project structure and PROJECT_MAP link ([43519c85](https://github.com/ilijanovic/voxely/commit/43519c85))

### 🏡 Chore

- Add quality-manager skill, extend docs and game systems (recipes, inventory, fluid, terrain) ([b6d85e77](https://github.com/ilijanovic/voxely/commit/b6d85e77))

### ❤️ Contributors

- Ilijanovic <ilija.marijanovic@gmx.at>

## v0.0.5

[compare changes](https://github.com/ilijanovic/voxely/compare/v0.0.4...v0.0.5)

### 🚀 Enhancements

- **game:** Add postprocessing options and interactive blocks ([39035bf2](https://github.com/ilijanovic/voxely/commit/39035bf2))

### 🩹 Fixes

- **game:** Keep chunks and snow layers in sync ([2f7e44d3](https://github.com/ilijanovic/voxely/commit/2f7e44d3))
- **atmosphere:** Revert weather to snow-only and blend biome tints ([6aedeb49](https://github.com/ilijanovic/voxely/commit/6aedeb49))
- **terrain:** Align plains layers and world uv mapping ([ecf60717](https://github.com/ilijanovic/voxely/commit/ecf60717))

### ❤️ Contributors

- Ilijanovic <ilija.marijanovic@gmx.at>

## v0.0.4

[compare changes](https://github.com/ilijanovic/voxely/compare/v0.0.3...v0.0.4)

### 🚀 Enhancements

- **atmosphere:** Add raining weather with biome rules and tuning ([07881da2](https://github.com/ilijanovic/voxely/commit/07881da2))

### ❤️ Contributors

- Ilijanovic <ilija.marijanovic@gmx.at>

## v0.0.3

[compare changes](https://github.com/ilijanovic/voxely/compare/v0.0.2...v0.0.3)

### 🚀 Enhancements

- **terrain:** Differentiate biome surface layers ([4cb5a86b](https://github.com/ilijanovic/voxely/commit/4cb5a86b))
- **terrain:** Add cave carving, structures, terrain features and extract chunk subsystems ([671d9e58](https://github.com/ilijanovic/voxely/commit/671d9e58))

### 📖 Documentation

- Add readme screenshot and alpha note ([27e4e78b](https://github.com/ilijanovic/voxely/commit/27e4e78b))

### ✅ Tests

- Add unit tests for entities, chunks, hotbar, mining; update chunk-generate-sync and existing tests ([c2c333d7](https://github.com/ilijanovic/voxely/commit/c2c333d7))

### ❤️ Contributors

- Ilijanovic <ilija.marijanovic@gmx.at>

## v0.0.2

[compare changes](https://github.com/ilijanovic/voxely/compare/v0.0.1...v0.0.2)

### 🔥 Performance

- **terrain:** Add chunk worker pool with stale filtering ([984ba363](https://github.com/ilijanovic/voxely/commit/984ba363))
- **terrain:** Transfer chunk voxel buffer as Uint8Array ([479f98ab](https://github.com/ilijanovic/voxely/commit/479f98ab))
- **terrain:** Build chunk geometry in worker ([bc99ab1c](https://github.com/ilijanovic/voxely/commit/bc99ab1c))

### ❤️ Contributors

- Ilijanovic <ilija.marijanovic@gmx.at>

## v0.0.1

[compare changes](https://github.com/ilijanovic/voxely/compare/v0.1.0...v0.0.1)

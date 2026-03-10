# Minecraft resource pack compatibility

## Scale and units (Minecraft-style)

The app uses the same scale as Minecraft so resource packs look correct. Reference: [Minecraft Wiki – Units of measure](https://minecraft.fandom.com/wiki/Tutorials/Units_of_measure).

- **Distance**: 1 block = 1 meter (1 m³). Chunk = 16×16 blocks.
- **Textures**: 1 meter = 16 pixels; standard block textures are **16×16 pixels per face**. The game uses nearest-neighbour filtering so they stay sharp.
- **Player**: Height **1.8 blocks** (collision and visual); first-person **eye height 1.62** blocks.
- **Water**: A water block is **0.9 m high** in Minecraft (surface at block Y + 0.9); the app uses this for the water plane and underwater detection.
- **Inventory**: Stacks cap at **64** items (Minecraft default for most blocks); some items stack to 16 (e.g. eggs, signs) — the app uses 64 for hotbar stacks.

## How Minecraft resource packs work

- **Format**: A resource pack is a folder or a `.zip` file with a fixed structure.
- **Root files**: `pack.mcmeta` (JSON metadata: description, `pack_format`) and optionally `pack.png` (thumbnail).
- **Assets path**: All block textures live under:
  ```
  assets/minecraft/textures/block/<name>.png
  ```
  So the full URL for a texture named `oak_planks` is  
  `{packRoot}/assets/minecraft/textures/block/oak_planks.png`.

- **Loading in Minecraft**: User places the pack (folder or zip) in the resourcepacks directory; the game loads textures from that root and merges/overrides the default assets.

Packs like **Alacrity** follow this layout (e.g. `assets/minecraft/models/block/...`, `assets/minecraft/textures/block/...`). Some packs use subfolders under `textures/block/` (e.g. `wooden/warped/log_1.png`); this app uses flat names from the block registry (e.g. `oak_planks`, `cobblestone`), which matches standard Vanilla and most packs that override the same names.

## Choosing a pack in the app

- **Default**: The default is the built-in **assets** (`/assets/minecraft/textures/block`, i.e. `public/assets/minecraft/textures/block/`). If a texture is missing, the game uses a grey fallback.
- **Options (Pause → Options → Graphics)**: The **Resource pack** dropdown is populated from `/packs/index.json` (or a fallback). Changing the selection saves your choice and reloads the game.
- **URL**: Use `?resource_pack=/packs/<name>` to load a specific pack; the URL overrides the saved selection (a leading `/` is optional).

## Making this app compatible

1. **Same path and names**  
   The app already uses Minecraft-style paths and texture names:
   - Base path: `/assets/minecraft/textures/block`
   - Block registry uses names like `oak_planks`, `cobblestone`, `grass_block_side`, etc., which match Vanilla and typical resource packs.

2. **Overridable pack root**  
   You can point the app at a different “pack root” so it loads block textures from that pack instead of the built-in assets:
   - **URL parameter**: `?resource_pack=/packs/Alacrity`  
     Block textures are then loaded from  
     `/packs/Alacrity/assets/minecraft/textures/block/<name>.png`.
   - **Serving the pack**: Place the pack (e.g. Alacrity folder or zip contents) under `public/packs/Alacrity/` so that `public/packs/Alacrity/assets/minecraft/textures/block/` is served at `/packs/Alacrity/assets/minecraft/textures/block/`.

3. **Using Alacrity (or any pack)**  
   - Copy the pack into `public/packs/<packname>/` (e.g. `public/packs/Alacrity/`) so that `assets/minecraft/textures/block/` exists under it.
   - Open the app with `?resource_pack=/packs/Alacrity`.
   - Only blocks whose texture names exist in the pack will show that pack’s art; others fall back to the default path if you implement fallback, or show missing texture.

4. **Optional: `pack.mcmeta`**  
   For display or validation you can later add loading `pack.mcmeta` from the pack root and use `pack.description` or `pack.pack_format` in the UI.

## Summary

- **How resource packs are loaded**: By using a pack root directory (or zip) and loading textures from `assets/minecraft/textures/block/<name>.png` under that root.
- **App compatibility**: Use the same path and naming; make the block texture base path overridable (e.g. via `?resource_pack=...`) so any Minecraft-style pack (e.g. Alacrity) can be used when placed under `public/packs/<name>/`.

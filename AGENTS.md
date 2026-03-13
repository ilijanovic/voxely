# Agent instructions – Voxely

Voxely is a Minecraft-like voxel game (Vue + TypeScript + Three.js).

- **Read first:** **docs/SYSTEMS_OVERVIEW.md** – how world generation, biomes, blocks, mobs, and atmosphere/weather fit together.
- **Then:** **docs/PROJECT_MAP.md** – where to find things in the codebase.

- Follow **.cursor/rules/** for language (English), git (conventional commits), terrain/biome integrity, project structure, and assistant workflow.
- For **interaction behavior** (when to ask clarifying questions, when to confirm understanding, safe defaults), follow **.cursor/rules/assistant-workflow.mdc** and **docs/LLM_WORKFLOW.md**.
- For **biome** changes use **.cursor/skills/biome-integration-assistant**; see PROJECT_MAP for other areas (blocks, entities, multiplayer).
- For test writing, test review, and regression prevention, use **.cursor/skills/quality-manager**.
- For deeper architecture and improvement ideas, see **docs/ARCHITECTURE.md**.
- For terrain/biome design and checklists, see **docs/TERRAIN_SPEC.md** and **docs/BIOME_TRANSITIONS.md**.

## Operating contract (LLM behavior, high level)

- **Ask when unclear or risky:** If a request is ambiguous or touches cross-cutting systems, contracts, or save data, ask 1–2 focused questions before large edits.
- **Confirm understanding for risky changes:** Briefly paraphrase the plan when changing contracts, core gameplay feel, or many files at once.
- **Proceed with safe defaults otherwise:** When the request is clear and low-risk, choose reasonable defaults, state them briefly, and move forward.
- **Respect terrain/worker purity:** Keep `src/terrain/**` pure (no THREE/DOM) and treat the worker payload shape as a strict contract between terrain ↔ worker ↔ runtime.

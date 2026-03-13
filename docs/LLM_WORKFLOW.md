# LLM Workflow – Stable, High-Automation Development

This doc defines a **repeatable workflow** for using AI assistants effectively in this codebase.
Goal: **small diffs, deterministic tests, strong CI gates, low regressions**, while keeping the assistant behavior predictable and Minecraft-like where relevant.

For interaction behavior (when to ask clarifying questions, when to confirm understanding, safe defaults), see also:

- `.cursor/rules/assistant-workflow.mdc` – assistant operating contract (always applied).
- This document – concrete workflow and checklists.

## 0) Always start here (context entry points)

- **Systems overview (read first):** `docs/SYSTEMS_OVERVIEW.md` – how biomes, blocks, mobs, weather connect.
- Navigation: `docs/PROJECT_MAP.md`
- Gameplay truth/spec split: `docs/GAMEPLAY_LLM.md`
- High-risk orchestration: `src/game.ts`
- Contracts & pipelines:
  - Worker boundary: `src/terrain-core.ts` ↔ `src/chunk-worker-handler.ts` ↔ `src/chunk.worker.ts`
  - Payload shape contract: `src/chunk-payload-contract.test.ts`
- Hot path pure modules (ideal for unit tests):
  - Collision: `src/game-collision.ts` (+ `src/game-collision.test.ts`)
  - Save/load: `src/save.ts` (+ `src/save.test.ts`)
  - Terrain sampling: `src/terrain-sampling.ts` (+ tests)

## 1) Standard task header (copy/paste into AI requests)

Fill this in before doing any change:

```text
### Goal
- What outcome do we want? (user-visible behavior)

### Non-goals
- What must NOT change?

### Scope
- Files likely involved:
  - …

### Expected tests
- Unit:
  - …
- Integration/contract:
  - …

### Repro / determinism
- Seed(s):
- Fixed time (if relevant):
- Fixture(s) / golden data:

### Acceptance criteria
- [ ] …
- [ ] …
```

## 1.1) Ask/confirm policy (balanced)

- **Ask clarifying questions first** when:
  - the request is ambiguous and several implementations would change gameplay differently;
  - the change is risky or cross-cutting (contracts, save format, terrain/worker/runtime boundaries);
  - the user asks for “Minecraft-like” behavior but important details are unspecified (e.g. drop rules, biome sizes).
- **Confirm understanding briefly** (1–2 sentences) when:
  - applying changes to contracts, core gameplay feel, or many files at once;
  - you just received answers to clarifying questions and are about to implement.
- **Skip extra confirmation** and proceed with reasonable defaults when:
  - the request is local and clear (single module, no contract changes);
  - impact is low and reversible. State chosen defaults explicitly in the answer.

Safe defaults you may assume:

- Do **not** commit or push unless explicitly asked (follow `.cursor/rules/git-commit.mdc` when committing).
- Keep `src/terrain/**` pure (no `THREE`, no DOM); treat worker payloads as strict contracts.
- Prefer extending existing patterns over inventing new architecture.
- When changing pure logic, add/update tests in `src/**/*.test.ts` and keep them deterministic.

## 2) Change strategy (LLM-efficient)

- Prefer **pure helpers** (inputs → outputs) over in-loop mutations.
- Keep PRs **single-purpose**: one behavior change, one bug fix, or one refactor.
- Prefer **additive edits** with strong tests over large rewrites.
- If touching a boundary/contract, update **contract tests first**.

## 3) “Diff checklist” before opening a PR

### Contracts / worker / payload

- [ ] Did `ChunkDataPayload` / `BlockModEntry` shape change?
- [ ] Are worker ↔ main-thread messages still aligned?
- [ ] Did you update `src/chunk-payload-contract.test.ts` and any fixtures?

### Save/load

- [ ] Can the new `SaveData` still load older versions? (explicit versioning)
- [ ] Does `src/save.test.ts` include a **roundtrip** for the new fields?

### World interactions (mining/placing/torches)

- [ ] Is behavior covered by `src/game/world-interactions/*.test.ts`?
- [ ] Are edge cases deterministic (no timeouts, stable seeds)?

### Performance-sensitive areas

- [ ] Did you avoid per-frame allocations in hot paths?
- [ ] If behavior changed in collision/meshing, did you run benchmarks (if present)?

## 4) PR template expectations (what reviewers expect)

Every PR should clearly state:

- Summary (what & why)
- Risk (hotspots / contracts / performance)
- Test plan (commands run + suites touched)
- Rollback plan (what to revert / feature flag if any)

## 5) Local command set (recommended)

```bash
npm ci
npm run test:run
npm run build
```

If lint/format scripts exist, run them too:

```bash
npm run lint
npm run format:check
```

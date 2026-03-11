## Summary

- What changed and why?

## Risk / hotspots

- Contracts touched? (`terrain-core.ts`, worker messages, `ChunkDataPayload`)
- Save/load touched? (`SaveData`, versioning)
- Performance-sensitive path touched? (collision, chunk meshing, worker geometry)

## Test plan

- [ ] `npm ci`
- [ ] `npm run test:run`
- [ ] `npm run build`
- [ ] Relevant focused tests (list files / suites):

## Rollback plan

- How do we revert safely if this regresses?

## Screenshots / video (if user-facing)

- Before/after:

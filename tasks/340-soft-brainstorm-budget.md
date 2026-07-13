---
id: 340
title: Soft-advance brainstorm when turn budget is reached
status: done
owner: codex-gpt-5
deps: [339]
owned_paths:
  - "packages/core/src/roundtable/engine.ts"
  - "packages/adapters/src/roundtable-engine.test.ts"
  - "tasks/340-soft-brainstorm-budget.md"
acceptance:
  - brainstorm turn-budget exhaustion does not pause the run when a later stage exists
  - unresolved brainstorm notes are written to artifacts/ideas.md before auto-advancing
  - plan/cost/wall-clock/quorum-loss budgets still pause safely
  - pnpm build and pnpm test pass
---
## Notes
User saw `pause: stage brainstorm hit turn budget (system)` and asked why the app does multiple rounds and whether it can automatically switch instead of stopping. The design currently pauses on any stage turn budget exhaustion to avoid runaway debates. For product feel, brainstorm should be a soft budget: carry the notes forward and continue to plan.

## Journal
- [codex-gpt-5] Started a core roundtable change. Plan: preserve hard safety pauses for cost, wall-clock, quorum loss, and final plan budget, but treat brainstorm turn budget as an auto-advance when there is a next stage.
- [codex-gpt-5] Implemented soft brainstorm budget rollover in the roundtable engine. When brainstorm reaches `maxTurnsPerStage` and a later stage exists, Quorum writes `artifacts/ideas.md` from the brainstorm turns, records a note, emits `stage brainstorm → plan`, resets seat order so plan starts with the proposer, and continues instead of pausing. Single-stage runs and later-stage turn budgets still pause; cost and wall-clock budgets remain hard safety stops. Added a regression test covering auto-advance + carried notes. Validation: targeted roundtable test passed; `pnpm build && pnpm test` passed (189 tests).

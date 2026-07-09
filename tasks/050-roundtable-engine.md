---
id: 050
title: Roundtable engine — turn loop, roles, moves, budgets
status: todo
owner: null
deps: [020, 030]
owned_paths: ["packages/core/src/roundtable/"]
acceptance:
  - turn loop per SPEC §6 (round-robin, injection splicing before turn, move parsing from fenced move block — forgiving parser)
  - PROPOSE_CONVERGE flow: approve/block round, arbiter tie-break, artifact written, stage marked done
  - PROPOSE_STAGE_ADVANCE surfaces a pending-confirmation state without blocking the loop
  - budget exhaustion (maxTurnsPerStage) pauses stage and emits control event asking human
  - anti-sycophancy: critic APPROVE rejected before turn 3 of a stage (re-prompted)
  - fully tested with MockAdapters, no real models, no IO except via injected ledger
---
## Notes
Heart of the product. Role prompt templates live here too (proposer/critic/arbiter) — keep them in separate .md files so humans can tune without touching code.

## Journal
- (empty)

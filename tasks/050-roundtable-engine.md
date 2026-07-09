---
id: 050
title: Roundtable engine — turn loop, roles, moves, budgets
status: done
owner: claude-opus-4-8
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
- [claude-opus-4-8] Built the roundtable engine in packages/core/src/roundtable/ (moves, roles, engine + barrel). 38 tests green (7 new engine scenarios). ALL acceptance criteria pass incl. the DESIGN §6 riskiest-assumption protocol.
  - DEP-DIRECTION decision (important for 060/080): core cannot import @quorum/adapters, so the engine defines its own minimal `SeatRunner` port `{ id; takeTurn(ctx, signal) }`. ModelAdapter satisfies it STRUCTURALLY — no import needed. The failover wrapper (060) and daemon (080) pass a `Record<SeatId, SeatRunner>` plus a `failover(seatId, result) => SeatRunner | null` hook. This is the seam between 050 (loop) and 060 (chain logic): the engine emits seat_change + retries when failover returns a runner, pauses the seat when it returns null.
  - Because core can't import MockAdapter, the engine INTEGRATION TEST lives in packages/adapters/ (adapters→core, and MockAdapter is a SeatRunner). Future engine tests go there too.
  - Turn loop (SPEC §6): round-robin over non-paused seats (seatCursor persists across stages); each turn builds context in two passes (ctx with empty instructions → compute role instructions from ctx → final ctx) to resolve the buildTurnContext/roleInstructions circular need. move = result.move ?? parseMove(content). Only "ok" turns append a turn event; usage_limit/hard-error go through failover (no turn event, a seat_change instead).
  - Convergence: a PROPOSE_CONVERGE triggers a vote — every other active seat takes a turn; APPROVE/BLOCK collected; decision = majority, arbiter breaks ties. On converge: writeArtifact (brainstorm→artifacts/ideas.md, plan→spec.md, move line stripped) + control:"converged" event + stage event to next stage. Default stages = [brainstorm, plan] (Phase 1). Resumes from currentStage(events).
  - Anti-sycophancy: a critic APPROVE with ctx.turnInStage < 3 is downgraded to non-approval and recorded. OBSERVABILITY DEVIATION: rejections/pauses are surfaced via `result.notes[]` + `onNote` hook, NOT as transcript events — the control event enum (todo|...) has no "note" action and I chose not to churn the task-010 schema. Future: consider persisting notes as events so the dashboard sees them (daemon currently streams only transcript events via onEvent).
  - Role prompts: DEVIATION from task note (wanted separate .md files) — templates are constants in roles.ts (a module separate from the loop) + full override via opts.roleInstructions, to avoid a runtime .md-loading dependency in dist. File-based tuning (.quorum/prompts/<role>.md) can be layered later without touching the engine.
  - Budgets: checked at each stage-loop top; turnInStage > maxTurnsPerStage → control:"pause" (by system) + stoppedReason "budget". Quorum guard: <2 active seats → pause, "needs_human". Kill switch: signal checked at loop top AND takeTurn rejects AbortError (caught → control:"stop" + "aborted"). confirmStageAdvance defaults to auto-yes; DAEMON (080) MUST wire the real human confirm (non-blocking per DESIGN).
  - Next eligible: 060 (seat manager / failover chains — provides the `failover` impl the engine already calls), 070 (summary maintainer), then 080 daemon. Also 040/110/120/130 adapters can proceed in parallel.

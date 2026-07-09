---
id: 230
title: Execute stage — assign → isolate → execute → verify → review → resolve
status: done
owner: claude-opus-4-8
deps: [200, 210, 220, 050]
owned_paths: ["packages/core/src/roundtable/execute.ts", "packages/core/src/roundtable/index.ts"]
acceptance:
  - an execute-stage driver iterates runtime tasks (deps done, lowest id), for each: assign an executor seat (canExecute), create a worktree (200), run the executor turn in it (210), run acceptance (220), then a roundtable REVIEW sub-stage (reuse 050) over the diff
  - approved → mergeWorktree + mark task done (updateTaskStatus); acceptance fail or review BLOCK → iterate (bounded) or mark blocked
  - new transcript events emitted for execution progress (task_start / task_result / merge) — extend the event schema in core types (additive, zod)
  - failover mid-task: if the executor hits usage_limit, the next chain model resumes the SAME task in the SAME worktree (no worktree recreation)
  - fully tested with MockAdapters (executor mock that "edits" a file in the worktree) + a temp git repo; no real models
---
## Notes
See DESIGN §13.1. This is the Phase-2 heart, analogous to task 050 for deliberation. Extends Stage handling: "execute" stage runs this driver instead of the deliberation loop. Human injection + STOP must work here too (STOP kills executor child + leaves worktree resumable). Adding transcript event types requires touching core types (task 010's schema) — additive only, journal it.

## Journal
- [claude-opus-4-8] runExecuteStage in packages/core/src/roundtable/execute.ts (123 tests, 4 new against real temp git repos). The Workshop loop per eligible runtime task (deps done, not done/blocked): updateTaskStatus in_progress → createWorktree → executor turn(s) in the worktree → runAcceptance(extractCommands) → review → merge+done / block. All 4 paths tested: happy merge-to-main, usage_limit failover (seat_change, same worktree, iter retried), block-on-acceptance-fail, block-on-review-reject.
  - Added 3 additive transcript event types (task_start / task_result / merge) to core types (task 010 schema) — zod discriminatedUnion, backward compatible.
  - INJECTION SEAMS: makeExecutor(worktreePath, attempt) → SeatRunner|null (attempt walks the seat chain for worktree-bound failover; null = exhausted). review?(taskId,title,diff,acceptancePassed) → {approved,reason}. The daemon wires makeExecutor to execute-mode Claude/Codex adapters (task 210) and review to a roundtable (reuse 050).
  - SCOPING DECISION: default review = approve iff acceptance passed (objective-gated). The full roundtable REVIEW sub-stage (DESIGN §13.1 step 5) is left to the daemon/240 wiring via the review hook — keeps 230 focused + fully unit-testable with no models. Executor context: stage "execute", instructions point at the worktree + acceptance criteria.
  - Next: 240 e2e — wire execute into the daemon + a REAL Codex-executor smoke on a tiny repo.

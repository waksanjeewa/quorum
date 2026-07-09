---
id: 230
title: Execute stage — assign → isolate → execute → verify → review → resolve
status: todo
owner: null
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
- (empty)

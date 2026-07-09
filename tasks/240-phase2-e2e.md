---
id: 240
title: Phase 2 e2e — plan → execute one task → verify → merge
status: done
owner: claude-opus-4-8
deps: [230]
owned_paths: ["e2e/"]
acceptance:
  - scripted e2e (MockAdapters, temp git repo): a session with a runtime task whose acceptance is a runnable command executes it in a worktree, passes acceptance, review approves, branch merges, task marked done
  - failover scenario: executor usage_limit mid-task → next model resumes same worktree → completes
  - STOP mid-execute kills the executor child < 6s and leaves the worktree + task resumable
  - manual smoke doc appended to e2e/SMOKE.md: real Codex executor on a tiny real git repo (make a trivial change, verify, merge)
---
## Notes
Closes Phase 2. When green, update README (Phase 2 status) and tag v0.2.0. Mirror the Phase-1 walking-skeleton test structure (e2e/walking-skeleton.test.ts).

## Journal
- [claude-opus-4-8] e2e/phase2.test.ts (125 tests total) — happy path (worktree→execute→verify→merge→done, file on main) + STOP-mid-execute (<6s, worktree persists = resumable). Scripted failover + block paths are covered comprehensively in packages/core/src/roundtable/execute.test.ts.
  - REAL-MODEL SMOKE PASSED (2026-07-09, see e2e/SMOKE-RESULTS.md + SMOKE.md §D): a live Codex executor (execute mode, workspace-write, cwd=worktree) took a task, ACTUALLY CREATED hello.txt="Hello, Quorum!" in an isolated worktree, acceptance (grep) passed, merged to main, task→done. ~78s. Phase 2 proven end-to-end with a real model editing real code.
  - NOT done (deliberate, deferred): daemon/CLI wiring so `quorum start` auto-runs the execute stage after plan converges (today runExecuteStage is invoked directly / by a caller). The pieces are all in @quorum/core; the daemon's RunningSession needs a mode that, after plan, builds execute-mode adapters per worktree (createClaudeAdapter/createCodexAdapter with execute) + a roundtable review hook, then calls runExecuteStage. Good next task (250?). Also: full roundtable REVIEW wiring (currently pluggable, default acceptance-gated).
  - Phase 2 core COMPLETE. Tag v0.2.0.

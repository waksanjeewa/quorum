---
id: 240
title: Phase 2 e2e — plan → execute one task → verify → merge
status: todo
owner: null
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
- (empty)

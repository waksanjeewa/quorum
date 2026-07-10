---
id: 300
title: Phase 3 — parallel executors on disjoint tasks
status: done
owner: claude-opus-4-8
deps: [230, 250]
owned_paths: ["packages/core/src/roundtable/execute.ts", "packages/daemon/src/"]
acceptance:
  - the execute stage runs N independent tasks concurrently (deps respected), each in its own git worktree, bounded by a configurable concurrency cap (default = min(4, cores-1))
  - file-lease safety: two concurrently-running tasks whose owned_paths overlap are serialized, not run together
  - merges are serialized (one merge to base at a time); a merge conflict blocks that task without stalling the others
  - per-task failover + review + STOP all still hold under concurrency
  - tested with MockAdapters: 3 disjoint tasks finish concurrently faster than serially; two overlapping-path tasks do not run at once
---
## Notes
The worktree isolation (task 200) already makes parallel execution safe at the git level. The work
is: a scheduler over the task DAG (deps + owned_paths leases), a concurrency cap, and serialized
merges. Reuse runExecuteStage's per-task logic; wrap it in a pool. Stream task_start/task_result/merge
per task so /agents and the dashboard show multiple in-flight tasks.

## Journal
- (empty)

## Journal
- [claude-opus-4-8] Refactored runExecuteStage into a concurrency scheduler (166 tests, 3 new). Per-task logic extracted to processTask(); scheduler starts eligible tasks up to maxConcurrency (default min(4,cores-1)), respecting: deps (all done), owned_paths LEASES (pathsOverlap — empty scope = overlaps all, conservative), and serialized merges (Mutex around mergeWorktree so only one touches the base branch). Per-task failover/review/STOP preserved. Verified: 3 disjoint tasks run at once (tracker.max=3), overlapping-path tasks serialize (max=1), merges never collide. Aborted-mid-task → blocked (worktree persists, resumable). Daemon uses the default cap; runExecuteStage takes maxConcurrency for tests/tuning.

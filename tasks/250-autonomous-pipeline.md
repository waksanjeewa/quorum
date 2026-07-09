---
id: 250
title: Autonomous pipeline — quorum start runs deliberate → decompose → execute
status: done
owner: claude-opus-4-8
deps: [230, 080, 090]
owned_paths: ["packages/core/src/roundtable/decompose.ts", "packages/daemon/src/", "packages/cli/src/"]
acceptance:
  - decomposePlan(session, planner) turns spec.md into runtime task files (title + `$ ` acceptance commands + owned_paths) via a model, parsed forgivingly from JSON; writes tasks/00N.md
  - the daemon RunningSession, when projectRoot is a git repo and autonomous mode is on, continues after plan converges into decompose → runExecuteStage (execute-mode adapters per worktree, review hook), streaming task_start/task_result/merge events
  - quorum start "build me X" from a git repo runs the whole pipeline; from a non-git dir it runs deliberation only and tells the user to git init
  - executor factory builds execute-mode Claude/Codex adapters per worktree from the seats' executor-capable models
  - tested with MockAdapters (planner outputs task JSON, executor writes files, temp git repo) end-to-end; real-model smoke appended to SMOKE-RESULTS
---
## Notes
See DESIGN §13. Review defaults to acceptance-gated (approve iff acceptance passed) for the MVP; full roundtable review over the diff is a follow-up. Decompose reliability depends on the model producing sensible acceptance commands — fall back to review-only when a task has no commands.

## Journal
- [claude-opus-4-8] Autonomous pipeline wired end-to-end (130 tests). decomposePlan (core/roundtable/decompose.ts): reads spec.md, one planner turn → JSON tasks (parseTasksJson tolerant of fences/prose), writes runtime task files with `$ `-prefixed acceptance. Daemon: buildExecutorFactory(config) builds execute-mode claude/codex adapters per worktree from executor-capable chain models; RunningSession.runPipeline = runRoundtable → (if autonomous && converged && projectRoot is git) decomposePlan(planner=first seat) → runExecuteStage. CLI `start` sets autonomous:true + projectRoot=cwd. Non-git dir → deliberation only (tested). Full MockAdapter e2e: plan→decompose→execute→merge→task done→file on main.
  - MVP scoping (journaled): planner for decompose = the first deliberation seat's runner (capable model). Review = acceptance-gated default (full roundtable-over-diff review deferred). Executor turns are NOT pause-gated yet (STOP still works via abort). Decompose reliability depends on the model producing runnable acceptance commands; empty acceptance → review-only task.
  - Next: real-model smoke of `quorum start "build me X"`, then task 260 install/onboarding.

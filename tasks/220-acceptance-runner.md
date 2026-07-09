---
id: 220
title: Acceptance runner — run task acceptance in a worktree
status: todo
owner: null
deps: [020]
owned_paths: ["packages/core/src/acceptance/"]
acceptance:
  - runAcceptance(worktreePath, commands: string[], signal) runs each command as a child process in cwd=worktreePath, capturing exit code + stdout/stderr (truncated)
  - returns { passed: boolean, results: [{ command, exitCode, output }] }; passed = every command exit 0
  - honors AbortSignal (kills child processes on abort); overall timeout per command (config, default 5m)
  - never throws on a failing command — a non-zero exit is data, not an exception
  - tested with real shell commands in a tmpdir (e.g. "true", "false", "echo hi")
---
## Notes
See DESIGN §13.3 — objective gate BEFORE the roundtable review. Task acceptance criteria in the runtime ledger (session tasks/) are currently free-text; Phase 2 assumes they include runnable commands (the plan stage should emit them, or a convention marks which acceptance lines are commands). Journal how you distinguish command vs prose acceptance lines.

## Journal
- (empty)

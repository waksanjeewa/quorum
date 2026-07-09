---
id: 220
title: Acceptance runner — run task acceptance in a worktree
status: done
owner: claude-opus-4-8
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
- [claude-opus-4-8] runAcceptance(cwd, commands, signal, opts) in packages/core/src/acceptance/. Spawns `sh -c <command>` per command in cwd, captures exit+output (truncated 8KiB), passed = all exit 0. Never throws (non-zero = data). Per-command timeout (default 5m → exit 124) + abort (exit 130) both kill the child (SIGTERM→SIGKILL 2s). 119 tests.
  - COMMAND vs PROSE convention (the "how do we know which acceptance lines are runnable" question): extractCommands() treats acceptance lines beginning with `$ ` as shell commands, strips the prefix; everything else is prose (human-verified). The plan stage should emit command acceptance lines with the `$ ` prefix. The execute stage (230) calls extractCommands(task.acceptance) then runAcceptance.
  - Next: 230 execute stage (assign→worktree→executor→acceptance→review→merge), then 240 e2e.

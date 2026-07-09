---
id: 210
title: Executor adapter mode — tools-enabled execute for claude/codex
status: todo
owner: null
deps: [110, 120]
owned_paths: ["packages/adapters/src/claude/", "packages/adapters/src/codex/", "packages/adapters/src/types.ts"]
acceptance:
  - Capabilities gains `canExecute: boolean`; claude/codex report true, ollama/http report false
  - an execute variant runs the underlying SDK with tools ENABLED, sandboxMode workspace-write, workingDirectory = a given worktree path (claude allowedTools non-empty; codex sandboxMode workspace-write instead of read-only)
  - deliberation mode (Phase 1) is unchanged and still the default (tools disabled, read-only)
  - execute turns return the same TurnResult; usage-limit + abort handling identical to deliberation
  - contract suite still passes; execute mode covered by a stub-client test (no real SDK/network)
---
## Notes
See DESIGN §13.2. Reuse the existing SdkAdapter/ChatClient. Add an `execute?: { workingDirectory: string }` option to the adapter factory (createClaudeAdapter/createCodexAdapter) or a separate makeExecutor(). The Codex read-only sandbox from task 120 becomes workspace-write ONLY in execute mode. Do NOT enable tools for deliberation seats.

## Journal
- (empty)

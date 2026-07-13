---
id: 338
title: Improve session UX, slash selection, and vague-goal clarification
status: done
owner: codex-gpt-5
deps: [337]
owned_paths:
  - "packages/cli/src/repl.ts"
  - "packages/cli/src/repl.test.ts"
  - "packages/core/src/roundtable/triage.ts"
  - "packages/core/src/roundtable/index.ts"
  - "packages/core/src/roundtable/triage.test.ts"
  - "packages/daemon/src/http-server.ts"
  - "packages/daemon/src/daemon.test.ts"
  - "packages/dashboard/src/index.ts"
  - "packages/dashboard/src/dashboard.test.ts"
  - "tasks/338-session-ux-and-clarification.md"
acceptance:
  - slash popup supports up/down keyboard selection and Enter inserts/runs the selected command
  - dashboard New roundtable reliably returns to compose mode
  - dashboard left panel lists multiple roundtable sessions and can reopen/select them
  - dashboard shows active agent/activity progress for the selected live session
  - unclear or incomplete inputs ask a clarifying question instead of starting a full run
  - pnpm build and pnpm test pass
---
## Notes
User liked the fixed slash popup and requested a more polished app experience: keyboard selection in the slash menu, reliable dashboard New roundtable, a session list in the left panel, visible active-agent progress, and safer handling of unclear/incomplete input.

## Journal
- [codex-gpt-5] Started task after confirming all prior tasks are done. Plan: keep the implementation local to CLI/dashboard/daemon/core triage, prefer deterministic heuristics for obviously incomplete goals, and preserve `/goal ...` as the explicit bypass for users who really want to start immediately.
- [codex-gpt-5] Implemented CLI slash menu selection with up/down arrows, amber row highlighting, and Enter submission for the highlighted command. The renderer now keeps the prompt on one line while moving selection, and line handling avoids duplicate prompts when a command prints above the prompt.
- [codex-gpt-5] Updated dashboard UX: the left rail now has Roundtables, Agents, and Activity sections; `/sessions` results populate the roundtable list; selecting a session reopens its stream; New roundtable reliably returns to compose mode and focuses the goal box; live thinking/turn/task/merge events update the activity card.
- [codex-gpt-5] Added a first-class `clarify` triage result. Incomplete/vague inputs such as `build`, `fix this`, and `make app` ask a follow-up question instead of starting a full run. Dashboard compose keeps the user's text visible for follow-up, while `/goal ...` still bypasses triage.
- [codex-gpt-5] Validation: `pnpm build` passed, `pnpm test` passed (188 tests), PTY smoke verified `/` plus Down/Down moves selection and Enter runs `/dashboard`, PTY smoke verified bare `build` asks for clarification without starting a session, and the live dashboard API returned `{"intent":"clarify"}` for `build`.

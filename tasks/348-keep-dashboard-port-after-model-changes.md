---
id: 348
title: Keep dashboard URL stable after model changes
status: done
owner: codex-gpt-5
deps: [347]
owned_paths:
  - "packages/cli/src/repl.ts"
  - "packages/cli/src/repl.test.ts"
  - "CHANGELOG.md"
  - "tasks/348-keep-dashboard-port-after-model-changes.md"
acceptance:
  - `/models` no longer restarts the dashboard server and changes the port
  - `/frugal` no longer restarts the dashboard server and changes the port
  - Newly saved API keys are refreshed into the existing daemon for the next session
  - CLI tells the user to refresh the existing dashboard tab/URL
  - build, tests, lint, and public-safety checks pass
---
## Notes
User reported that every model change changes the dashboard URL/port. Root cause is the interactive shell closing and recreating the dashboard server after `/models` and `/frugal`; because the daemon listens on port `0`, the OS assigns a new random port each restart.

## Journal
- [codex-gpt-5] Started task after reading DESIGN.md, SPEC.md, and task ledger. Will keep the existing dashboard server alive, refresh daemon env vars from config/Keychain for future sessions, and ask the user to refresh the same dashboard URL.
- [codex-gpt-5] Removed the `/models` and `/frugal` dashboard restart path from the interactive shell. Added `syncDaemonEnvKeys` so saved API keys are refreshed into the existing daemon for the next session without closing the server or changing ports.
- [codex-gpt-5] The shell now tells the user: `models saved. Refresh the dashboard tab — same URL: ...`. Added regression coverage for daemon env refresh and updated the changelog.
- [codex-gpt-5] Validation passed: targeted `repl.test.ts`, `corepack pnpm build`, `corepack pnpm test` (193 tests), `corepack pnpm lint`, `git diff --check`, palette scan (only the explicit no-purple checklist mention), restart-path grep, and tracked-file public-safety scan.

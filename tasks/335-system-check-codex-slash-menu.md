---
id: 335
title: System check, Codex readiness, and slash menu hardening
status: done
owner: codex-gpt-5
deps: [270, 334]
owned_paths: ["packages/cli/src/repl.ts", "packages/cli/src/repl.test.ts", "packages/cli/src/index.ts", "tasks/335-system-check-codex-slash-menu.md"]
acceptance:
  - in-shell `/doctor` performs the live executor turn check for Codex/Claude like `quorum doctor`
  - slash commands are exposed through a testable completion/menu helper for the terminal popup
  - Codex-specific failure guidance is shown when a live check fails with the known Codex model/version issue
  - pnpm build and pnpm test pass
---
## Notes
User asked for an overall system check, to make sure Codex works with the app, and to ensure typing `/` in the terminal shows available options like Claude terminal.

## Journal
- [codex-gpt-5] Started by reading DESIGN.md, SPEC.md, and the task ledger. Found the REPL already has a live slash popup, but it lacked focused tests. Found the standalone `quorum doctor` does a live tiny executor turn, while in-shell `/doctor` only ran the shallow `doctorReport`, so Codex could appear ready in the app before a real-turn failure.
- [codex-gpt-5] Completed the system pass. In-shell `/doctor` now resolves Keychain/env secrets and runs `liveTurnCheck` for reachable Claude/Codex executors, with Codex-specific guidance for the known model/version failure. Exported and tested slash menu matching/completion helpers so the terminal popup behavior is covered. Fixed the duplicate `resume` CLI switch warning by making `quorum resume` resume an active paused daemon when present, otherwise resume a stopped session from disk. Added startup Ctrl+C cancellation so the REPL remains interruptible while triage/convening is spinning. Verified `pnpm build`, `pnpm test` (181 tests), PTY smoke for typing `/` showing the popup, Codex CLI installed (`codex-cli 0.132.0`), and current-build `node packages/cli/dist/index.js doctor` passed a live Codex `codex/gpt-5.5` test turn with 3/3 seats ready.

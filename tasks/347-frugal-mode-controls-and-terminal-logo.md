---
id: 347
title: Add explicit frugal controls and tighten terminal logo alignment
status: done
owner: codex-gpt-5
deps: [346]
owned_paths:
  - "packages/cli/src/setup.ts"
  - "packages/cli/src/setup.test.ts"
  - "packages/cli/src/repl.ts"
  - "packages/cli/src/repl.test.ts"
  - "packages/cli/src/theme.ts"
  - "packages/cli/src/theme.test.ts"
  - "packages/dashboard/src/index.ts"
  - "packages/dashboard/src/dashboard.test.ts"
  - "README.md"
  - "docs/index.html"
  - "docs/getting-started.md"
  - "docs/configuration.md"
  - "CHANGELOG.md"
  - "tasks/347-frugal-mode-controls-and-terminal-logo.md"
acceptance:
  - Dashboard has an explicit Frugal mode control, not only an indirect Budget preset
  - Dashboard settings let the user choose the free drafting models and paid verifier models
  - Terminal slash menu exposes `/frugal`
  - `/frugal` guides model selection and writes frugal free-first/paid-first seat chains
  - Terminal launch logo aligns the compact mark and ASCII word cleanly
  - build, tests, lint, and public-safety checks pass
---
## Notes
User wants frugal mode to be easier to discover and configure: a dashboard button, a terminal slash command, explicit free-model and paid-model choices, plus a fix for the terminal logo alignment shown in the screenshot.

## Journal
- [codex-gpt-5] Started task after reading DESIGN.md, SPEC.md, and the task ledger. Will make frugal mode first-class in both CLI and dashboard, preserve existing model setup behavior, and tighten the terminal lockup.
- [codex-gpt-5] Added `/frugal` to the terminal slash menu/help and implemented `runFrugalSetup`, which reuses model setup but forces the frugal flow and lets the user choose selected free draft models and paid/subscription verifier models. Added tests for explicit free/paid frugal chains and slash completion.
- [codex-gpt-5] Added an explicit dashboard **Frugal** preset plus a Settings → Frugal mode section with separate inputs for free draft models and paid verifier models. The dashboard applies proposer free-first, critic/arbiter paid-first chains and saves through the existing settings API.
- [codex-gpt-5] Tightened the terminal launch lockup: the compact mark top node now sits alone, the ASCII `QUORUM` word aligns with the main icon body, and the logo uses one clean tagline line. Updated README, getting-started/configuration docs, public docs page, and changelog.
- [codex-gpt-5] Validation passed: targeted frugal/logo/dashboard tests, `corepack pnpm build`, `corepack pnpm test` (192 tests), `corepack pnpm lint`, `git diff --check`, palette scan (only the explicit no-purple checklist mention), terminal-logo smoke, and tracked-file public-safety scan.

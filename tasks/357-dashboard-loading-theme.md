---
id: 357
title: Add dashboard loading state and theme control
status: done
owner: codex-gpt-5
deps: [356]
owned_paths:
  - "packages/dashboard/src/index.ts"
  - "packages/dashboard/src/dashboard.test.ts"
  - "CHANGELOG.md"
  - "tasks/357-dashboard-loading-theme.md"
acceptance:
  - Dashboard compose view shows an immediate loading/progress indication after a goal is submitted
  - Loading state covers triage and roundtable creation and clears on chat/clarify/error/live transition
  - Settings includes System/Dark/Light appearance control
  - Theme choice applies immediately and persists locally without changing project config
  - Dashboard tests, build, lint, and diff checks pass
---
## Notes
User reported that after typing and submitting a dashboard goal, it can take a long time before the working/live window opens. They also asked for user-controlled dark/light mode options in dashboard settings.

## Journal
- [codex-gpt-5] Started after reading DESIGN.md, SPEC.md, and the task ledger. Implementing this in the self-contained dashboard bundle: a compose-level busy/loading indicator around triage/session creation, plus a localStorage-backed appearance selector in Settings so project config does not need a new schema field.
- [codex-gpt-5] Added a compose loading state with spinner, status text, disabled submit/read-only goal box, and aria-live messaging while triage/session creation runs. It clears for chat/clarify/meta/error and when returning to New roundtable. Added Settings → Appearance with System/Dark/Light theme control; it applies immediately via root `data-theme` and persists in localStorage under `quorum.theme`. Updated dashboard tests and changelog. Validation: dashboard test passed, `corepack pnpm build` passed, `corepack pnpm test` passed (205 tests / 29 files), `corepack pnpm lint` passed, and `git diff --check` passed.

---
id: 350
title: Fix dashboard empty body regression
status: done
owner: codex-gpt-5
deps: [349]
owned_paths:
  - "packages/dashboard/src/index.ts"
  - "packages/dashboard/src/dashboard.test.ts"
  - "tasks/350-fix-dashboard-empty-body.md"
acceptance:
  - Dashboard shows a usable compose body even if startup API calls fail or return partial settings
  - Dashboard shows an inline error/retry state instead of a blank body when boot fails
  - Existing live/session dashboard behavior remains intact
  - build, tests, lint, and diff checks pass
---
## Notes
User reported the dashboard only shows the top menus/header and not the body area.

## Journal
- [codex-gpt-5] Started task after reading DESIGN.md, SPEC.md, and the task ledger. The likely failure mode is startup JavaScript error before `body[data-view]` is set, because CSS hides both compose and live bodies until boot selects a view.
- [codex-gpt-5] Fixed the real browser break: the inline dashboard script emitted an invalid regex (`split(/[,\n]+/)` became a literal newline in the generated script), so Chrome skipped all dashboard JavaScript and only the static header/body shell remained. Escaped it as `[,\\n]` and added a regression test that parses the emitted inline script.
- [codex-gpt-5] Made dashboard boot resilient: the HTML now defaults to compose view, settings/session responses are normalized, partial settings no longer throw, and boot failures show a retry message instead of leaving a blank body.
- [codex-gpt-5] Verified with a real headless Chrome render at a local daemon URL; the compose body, model chips, fuse line, input, and buttons all appeared. Validation passed: dashboard test, `corepack pnpm build`, `corepack pnpm test` (199 tests), `corepack pnpm lint`, and `git diff --check`.

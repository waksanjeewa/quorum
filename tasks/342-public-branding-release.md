---
id: 342
title: Public launch branding, docs, and repository publication
status: done
owner: codex-gpt-5
deps: [341]
owned_paths:
  - "packages/cli/src/theme.ts"
  - "packages/cli/src/theme.test.ts"
  - "packages/dashboard/src/index.ts"
  - "packages/dashboard/src/dashboard.test.ts"
  - "README.md"
  - "docs/getting-started.md"
  - "docs/configuration.md"
  - "docs/architecture.md"
  - "docs/publishing.md"
  - "docs/index.html"
  - "CHANGELOG.md"
  - "tasks/342-public-branding-release.md"
acceptance:
  - dashboard header and compose hero use the real Quorum logo mark, not a generic glyph
  - CLI launch banner keeps the ASCII QUORUM word while adding a compact terminal mark inspired by logo v2
  - public docs reflect the current terminal/dashboard/model UX and avoid competitor purple/violet/magenta/indigo tones
  - repository passes build, lint, tests, package smoke, and a redacted secret scan
  - GitHub repository is public and current local changes are pushed
---
## Notes
User likes the ASCII word "QUORUM" in the terminal, but wants the compact logo mark to feel closer to Claude's terminal treatment. User also asked to add the real logo to the dashboard, update docs, double/triple check the system, and make the repo public.

This task necessarily bundles prior uncommitted local improvements from tasks 335–341 when publishing, because those changes are already in the working tree and represent the approved current app behavior. Avoid resetting or splitting them after the fact.

## Journal
- [codex-gpt-5] Started public-launch pass. Read DESIGN.md, SPEC.md, and task ledger first. Plan: update dashboard/terminal branding, refresh public docs, run build/lint/tests/package/secret checks, then push and make GitHub repo public if validation is clean.
- [codex-gpt-5] Implemented dashboard logo integration using the real six-seat/faceted Quorum mark in the app header and compose hero. Revised the terminal launch banner to keep the correct ASCII `QUORUM` word while adding a compact logo-v2-inspired mark with one amber consensus node. Refreshed README, docs, docs site, publishing checklist, and changelog for the current slash-popup, dashboard roundtable/activity, clarification, and soft-advance behavior.
- [codex-gpt-5] Validation passed before publication: `corepack pnpm exec vitest run packages/cli/src/theme.test.ts packages/dashboard/src/dashboard.test.ts`, `corepack pnpm build`, `corepack pnpm lint`, `corepack pnpm test` (190 tests), `git diff --check`, npm pack smoke (`node package/dist/index.js --version` printed 0.8.0 and bundled workspace import count was 0), redacted concrete credential scan, and `NO_COLOR=1 node packages/cli/dist/index.js doctor` including a tiny Codex executor turn. GitHub reports `waksanjeewa/quorum` is already PUBLIC; next step is to commit and push this validated local state.
- [codex-gpt-5] Published validated changes to the public GitHub repository on `main` (`a0258a7`, `[342] prepare public launch`). Task is done: branding/docs/system checks passed, repository visibility is PUBLIC, and the local release state is pushed.

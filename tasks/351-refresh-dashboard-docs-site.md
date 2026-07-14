---
id: 351
title: Refresh dashboard docs and GitHub site
status: done
owner: codex-gpt-5
deps: [350]
owned_paths:
  - "README.md"
  - "docs/index.html"
  - "docs/getting-started.md"
  - "docs/configuration.md"
  - "CHANGELOG.md"
  - "tasks/351-refresh-dashboard-docs-site.md"
acceptance:
  - README explains the current dashboard behavior, stable URL, and retry/refresh path
  - GitHub Pages site reflects the current dashboard/terminal UX without adding visual clutter
  - Getting-started/config docs mention dashboard model settings, same-port refresh, and safe startup
  - Changelog records the dashboard boot/body stability fix
  - build, tests, lint, and doc sanity checks pass
---
## Notes
User asked to push the update and refresh documentation including the GitHub site and repository page after the dashboard body fix.

## Journal
- [codex-gpt-5] Started after reading DESIGN.md, SPEC.md, and checking the task ledger. No active todo/in-progress task blocked this docs refresh. The repo uses `docs/index.html` as the GitHub Pages site, so this task will update README/docs/site files directly rather than using OpenAI Sites hosting.
- [codex-gpt-5] Updated README, Getting Started, Configuration, Changelog, and the GitHub Pages `docs/index.html` copy to explain the current dashboard behavior: New roundtable composer, stable same-port URL after model changes, refresh/retry guidance, and no blank body if local settings lag.
- [codex-gpt-5] Rendered `docs/index.html` locally in headless Chrome and confirmed the public page remains visually clean. Validation passed: `corepack pnpm build`, `corepack pnpm test` (199 tests), `corepack pnpm lint`, `git diff --check`, palette scan (only expected no-purple checklist line), and tracked-file public-safety scan.

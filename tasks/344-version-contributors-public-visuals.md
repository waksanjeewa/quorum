---
id: 344
title: Version badges, contributors, terminal alignment, and public visuals
status: done
owner: codex-gpt-5
deps: [343]
owned_paths:
  - "packages/cli/src/theme.ts"
  - "packages/cli/src/theme.test.ts"
  - "packages/cli/src/repl.ts"
  - "packages/dashboard/src/index.ts"
  - "packages/dashboard/src/dashboard.test.ts"
  - "packages/cli/package.json"
  - "README.md"
  - "CHANGELOG.md"
  - "docs/index.html"
  - "docs/quorum-github-hero.svg"
  - "tasks/344-version-contributors-public-visuals.md"
acceptance:
  - dashboard shows the current public app version
  - public docs/README show the current public version
  - terminal launch logo is visually tighter and the ASCII `QUORUM` word no longer drifts away from the mark
  - README includes Codex as an AI implementation contributor
  - GitHub/public page visuals explain Quorum's roundtable/workshop flow clearly and avoid the old white-edged logo image
  - build, lint, tests, and public-safety scan pass
---
## Notes
User reported the terminal ASCII logo shifted visually after the last logo changes, asked for version display in the dashboard and public version, asked to add Codex to contributors, and asked to improve the GitHub/docs page visuals so newcomers understand the app quickly.

## Journal
- [codex-gpt-5] Started task. Inspected current CLI theme, dashboard renderer/tests, package version, README/docs site, and logo assets. Plan: tighten terminal lockup, add version pills, create a README hero SVG matching the web palette, add contributor attribution, and validate/push.
- [codex-gpt-5] Tightened the terminal launch lockup so the compact consensus mark and ASCII `QUORUM` word share a measured 14-column mark area; moved the “session never dies” line into the logo block and removed the separately-indented REPL tagline that caused visual drift. Added regression coverage for column width and mark/word distance.
- [codex-gpt-5] Added visible `v0.8.0` version pills to the dashboard header/compose view, README hero, and public docs site. Added Codex as an AI implementation contributor in README and package metadata. Replaced the README PNG logo with `docs/quorum-github-hero.svg`, a dark brand-matched hero graphic, and added a clearer public webpage walkthrough for terminal → dashboard → verified merge.
- [codex-gpt-5] Validation passed: focused logo/dashboard tests, `corepack pnpm build`, bundled terminal logo smoke, `corepack pnpm test` (190 tests), `corepack pnpm lint`, SVG XML parsing, package JSON parsing, `git diff --check`, palette scan (only the explicit no-purple checklist mention), and tracked-file public-safety scan.

---
id: 346
title: Clean README hero banner
status: done
owner: codex-gpt-5
deps: [345]
owned_paths:
  - "docs/quorum-github-hero.svg"
  - "CHANGELOG.md"
  - "tasks/346-clean-readme-hero-banner.md"
acceptance:
  - README hero no longer embeds the long install command
  - README hero has no clipped or overrunning text
  - README still keeps the one-line install command visible as copyable text
  - build, tests, lint, SVG validation, and public-safety scan pass
---
## Notes
User shared a GitHub README screenshot where the hero banner includes the install command, causing the text to overrun/clamp inside the SVG. The install command should remain visible on the README, but not inside the banner image.

## Journal
- [codex-gpt-5] Started task after prior read of DESIGN.md, SPEC.md, and task ledger. Will remove the install command from the hero SVG, replace it with a tighter product-flow visual, and validate before pushing.
- [codex-gpt-5] Removed the long install command from the GitHub hero SVG and replaced it with compact Goal → Roundtable → Workshop → Merged cards. The README still shows the install command as copyable text above the fold. Updated the changelog.
- [codex-gpt-5] Validation passed: SVG XML parsing, `git diff --check`, palette scan (only the explicit no-purple checklist mention), `corepack pnpm build`, `corepack pnpm test` (190 tests), `corepack pnpm lint`, and tracked-file public-safety scan.

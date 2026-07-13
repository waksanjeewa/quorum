---
id: 345
title: Simplify README hero and surface one-line install
status: done
owner: codex-gpt-5
deps: [344]
owned_paths:
  - "README.md"
  - "docs/index.html"
  - "docs/quorum-github-hero.svg"
  - "CHANGELOG.md"
  - "tasks/345-readme-install-visual-polish.md"
acceptance:
  - GitHub README shows the one-line install command above the fold
  - README hero is more compact, balanced, and free of clipped/cramped flow cards
  - README is simpler to scan for a new user
  - public webpage also keeps installation prominent and visually clear
  - build, tests, lint, SVG validation, and public-safety scan pass
---
## Notes
User shared a GitHub README screenshot and reported visual issues. The screenshot shows the hero occupying too much vertical space, the right-side flow card feeling cramped, and the one-line install command not visible near the top. Goal is to make the GitHub page simpler, more appealing, and easier to use.

## Journal
- [codex-gpt-5] Started task after reading DESIGN.md, SPEC.md, and task ledger. Will tighten the README hero, move one-line install above the fold, reduce duplicated Mermaid/flow content, and validate before pushing.
- [codex-gpt-5] Reworked the GitHub README top section so the one-line install command appears immediately after badges/links, followed by `quorum`. Removed the duplicated top Mermaid diagram and made the intro read as a simple one-line flow: `Goal → Roundtable → Workshop → Verified merge`.
- [codex-gpt-5] Replaced the GitHub hero SVG with a shorter, less cramped design that keeps the logo, version, install bar, and simple flow inside the frame without the clipped right-side card. Strengthened the public webpage install block with a “One-line install” label and higher-contrast terminal styling. Updated the changelog.
- [codex-gpt-5] Validation passed: `corepack pnpm build`, `corepack pnpm test` (190 tests), `corepack pnpm lint`, SVG XML parsing, `git diff --check`, palette scan (only the explicit no-purple checklist mention), and tracked-file public-safety scan.

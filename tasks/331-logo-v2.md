---
id: 331
title: Quorum logo v2 vector assets
status: done
owner: codex-gpt-5
deps: []
owned_paths: ["brand-assets/quorum-logo-v2/", "tasks/331-logo-v2.md"]
acceptance:
  - icon-only, horizontal lockup, and monochrome variants exist as SVG
  - each variant has transparent and dark-background versions
  - assets use only the approved Quorum palette
  - pnpm test passes
---
## Notes
User asked to try the app logo again because the prior generated logo did not feel modern enough. This task creates a deterministic vector logo system rather than another raster-only concept sheet.

## Journal
- [codex-gpt-5] Started a v2 logo direction. Chose a blended "consensus table" mark: six evenly placed agent seats around a faceted center, with one amber seat as the decision/consensus signal. Keeping files isolated under `brand-assets/quorum-logo-v2/`.
- [codex-gpt-5] Completed the v2 vector logo set: icon, lockup, and monochrome variants, each on transparent and dark backgrounds. Added Quick Look PNG previews for the dark icon and lockup. Verified all SVGs parse with `xmllint`, palette scan found only approved brand colors, `pnpm test` passes (172 tests), and `pnpm build` passes.

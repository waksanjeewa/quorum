---
id: 330
title: Terminal banner and brand assets refresh
status: done
owner: codex-gpt-5
deps: []
owned_paths: ["packages/cli/src/theme.ts", "packages/cli/src/format.ts", "docs/index.html", "brand-assets/quorum-terminal-banner/", "tasks/330-terminal-brand-assets.md"]
acceptance:
  - CLI terminal banner spells QUORUM clearly and uses the Quorum emerald/teal/cyan palette with amber subtitle accent
  - Terminal color palette contains only the approved Quorum brand colors
  - Raw ASCII and ANSI truecolor banner assets are saved under brand-assets/
  - pnpm test passes
---
## Notes
User requested the corrected terminal banner/logo be written to local files. This task is intentionally scoped to brand/banner files and the CLI terminal surface.

## Journal
- [codex-gpt-5] Started task after all existing ledger tasks were done. Updating the CLI launch banner and terminal palette to match the Quorum brand brief: emerald/teal/cyan with a single amber subtitle accent and no off-brand competitor tones.
- [codex-gpt-5] Completed the brand refresh. Added saved terminal banner assets under `brand-assets/quorum-terminal-banner/`, updated the interactive CLI welcome to render the corrected QUORUM ASCII mark with an emerald→teal→cyan gradient and amber subtitle, moved terminal event colors to the approved palette, and replaced old landing-page brand colors in `docs/index.html`. Verified `sh brand-assets/quorum-terminal-banner/ansi-truecolor-banner.sh` strips to the correct spelling, brand-color scan has no old off-brand hex/ANSI matches, `pnpm build` passes, and `pnpm test` passes (172 tests).

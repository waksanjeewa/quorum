---
id: 341
title: Replace ASCII launch banner with compact terminal logo
status: done
owner: codex-gpt-5
deps: [340]
owned_paths:
  - "packages/cli/src/theme.ts"
  - "packages/cli/src/theme.test.ts"
  - "tasks/341-compact-terminal-logo.md"
acceptance:
  - CLI launch header uses a compact logo-v2-inspired Unicode mark instead of figlet/ASCII word art
  - logo uses only Quorum brand colors and preserves the single amber consensus accent
  - non-color terminals still get a readable plain Unicode lockup
  - pnpm build and pnpm test pass
---
## Notes
User wants the terminal launch logo to feel more like Claude's compact branded mark, not the big ASCII/figlet banner. The repo already has logo v2 assets in `brand-assets/quorum-logo-v2/` and a Unicode terminal interpretation in `brand-assets/quorum-terminal-banner/`.

## Journal
- [codex-gpt-5] Started focused CLI theme update. Plan: replace the ASCII word-art constant with a compact six-seat consensus-table lockup derived from logo v2, keep the existing prompt chip and dashboard output unchanged, and add a small regression test that guards against the old figlet banner coming back.
- [codex-gpt-5] Replaced the old figlet/ASCII word-art banner with `QUORUM_TERMINAL_LOCKUP`, a compact Unicode six-seat consensus mark with Quorum wordmark and tagline. The color path uses emerald/teal/cyan with one amber consensus node; the non-color path stays readable as plain Unicode. Added `theme.test.ts` to assert the compact logo includes the mark/wordmark and excludes the old ASCII figlet fragments. Validation: `pnpm build` passed, `pnpm test` passed (190 tests), and a PTY launch smoke showed the new compact header.

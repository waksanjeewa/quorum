---
id: 332
title: Terminal ASCII logo v2
status: done
owner: codex-gpt-5
deps: [331]
owned_paths: ["packages/cli/src/theme.ts", "brand-assets/quorum-terminal-banner/", "tasks/332-ascii-logo-v2.md"]
acceptance:
  - CLI terminal banner visually matches the v2 consensus-table logo direction
  - raw ASCII and ANSI truecolor banner assets are updated
  - banner stays under 80 columns
  - pnpm test passes
---
## Notes
User liked the v2 app logo and asked to update the ASCII logo to match it.

## Journal
- [codex-gpt-5] Started v2 ASCII banner update. Using a compact six-seat terminal mark beside the QUORUM wordmark: five cool `o` seats, one `*` consensus seat for the amber node, and a small faceted center.
- [codex-gpt-5] Completed the v2 ASCII banner update. Updated the CLI launch banner in `packages/cli/src/theme.ts`, refreshed `raw-ascii.txt`, and replaced the ANSI shell asset with a safer awk-based truecolor renderer. Verified the stripped ANSI output matches the raw banner, max width is 57 columns, brand-color scan is clean, `pnpm build` passes, and `pnpm test` passes (172 tests).

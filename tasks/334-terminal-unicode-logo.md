---
id: 334
title: Terminal Unicode color logo
status: done
owner: codex-gpt-5
deps: [331]
owned_paths: ["brand-assets/quorum-terminal-banner/", "tasks/334-terminal-unicode-logo.md"]
acceptance:
  - Unicode terminal logo asset exists separately from the ASCII banner
  - color version uses ANSI 24-bit truecolor with only approved Quorum colors
  - plain preview is readable without ANSI color
  - pnpm test passes
---
## Notes
User asked for a color terminal logo that is not ASCII art. This creates a Unicode/ANSI version that echoes the v2 consensus-table app logo.

## Journal
- [codex-gpt-5] Started a separate Unicode terminal logo asset. Keeping it separate from the ASCII/figlet banner so the CLI can choose either mode later.
- [codex-gpt-5] Completed the Unicode terminal logo assets. Added a plain preview and an ANSI 24-bit truecolor shell script under `brand-assets/quorum-terminal-banner/`. Verified the script strips to the expected Unicode mark, uses only approved Quorum hex colors, supports `NO_COLOR`, and `pnpm test` passes (172 tests).

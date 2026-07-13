---
id: 336
title: Fix slash popup terminal rendering
status: done
owner: codex-gpt-5
deps: [335]
owned_paths: ["packages/cli/src/repl.ts", "packages/cli/src/repl.test.ts", "tasks/336-fix-slash-popup-render.md"]
acceptance:
  - typing `/` leaves the command popup visible below the prompt in a real terminal
  - popup render helper is covered by a focused test
  - pnpm build and pnpm test pass
---
## Notes
User reported that typing `/` did nothing. Root cause: the menu was drawn, then readline refreshed the prompt and cleared below the cursor, erasing the menu on a real terminal.

## Journal
- [codex-gpt-5] Started fix after reproducing the likely terminal-control issue from PTY output. The previous smoke log showed menu text, but the final escape sequence order refreshed readline after drawing the menu, which can clear the popup from the visible terminal.
- [codex-gpt-5] Fixed the render order by redrawing the prompt first, then rendering the slash menu below it with cursor save/restore. Added focused coverage for `renderSlashMenu` to ensure it does not embed clear-below control sequences. Validation: `pnpm build` passed, `pnpm test` passed (182 tests), and an interactive PTY smoke test showed `/` leaving the popup visible below `◆ quorum ❯ /`. The global `quorum` command already points at this local CLI build, so restarting the CLI is enough to pick up the fix.

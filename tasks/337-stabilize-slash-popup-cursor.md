---
id: 337
title: Stabilize slash popup cursor restoration
status: done
owner: codex-gpt-5
deps: [336]
owned_paths: ["packages/cli/src/repl.ts", "packages/cli/src/repl.test.ts", "tasks/337-stabilize-slash-popup-cursor.md"]
acceptance:
  - typing additional letters after `/` updates the popup without printing a new prompt line per key
  - popup cursor restoration does not depend on save/restore escape sequences
  - focused tests cover the cursor movement sequence
  - pnpm build and pnpm test pass
---
## Notes
User reported the first popup appears, but every next key (`/g`, `/go`, etc.) prints a fresh prompt line below the menu. The likely cause is terminal-specific behavior around save/restore cursor escape sequences used by task 336.

## Journal
- [codex-gpt-5] Started follow-up fix. Plan: stop depending on cursor save/restore and render the menu with explicit newline + cursor-up + carriage-return + column restore, which mirrors the style of control sequences readline-compatible terminals already support.
- [codex-gpt-5] Implemented explicit cursor restoration in `renderSlashMenu(matches, cursorColumn)`: print menu below the prompt, move up by the number of menu rows, carriage-return, then move right to the current readline cursor column. Removed reliance on `ESC 7` / `ESC 8` save/restore sequences. Validation: `pnpm build` passed, `pnpm test` passed (182 tests), `node packages/cli/dist/index.js` PTY smoke showed `/goal` filtering with cursor-up restoration, and direct global `quorum` smoke confirmed the installed command resolves to this rebuilt local dist.

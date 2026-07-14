---
id: 354
title: Verify Windows installer exposes quorum command
status: done
owner: codex-gpt-5
deps: [353]
owned_paths:
  - "install.ps1"
  - "CHANGELOG.md"
  - "tasks/354-verify-windows-quorum-command.md"
acceptance:
  - Windows installer checks npm global bin path after linking the CLI
  - npm global bin path is added to the current process PATH and Windows user PATH when needed
  - Installer verifies `quorum --version` before printing success, or gives an actionable path hint
  - PowerShell parser and isolated installer smoke checks pass
---
## Notes
User opened a fresh Windows PowerShell after the first failed installer run and `quorum` was not recognized. That first run stopped before installing Quorum, but the installer should also guard the next likely failure mode: npm's global link folder not being on PATH.

## Journal
- [codex-gpt-5] Started after checking the clean repo state and latest task ledger. Adding an end-of-installer verification step so `install.ps1` does not claim success unless the `quorum` command is discoverable, and adding npm's global bin path to the current process plus Windows user PATH when needed.
- [codex-gpt-5] Added npm global bin discovery via `npm prefix -g`, current-process PATH insertion, Windows user PATH persistence, and a final `quorum --version` verification before printing success. Validation: PowerShell parser check passed, `git diff --check` passed, fresh isolated `pwsh -File ./install.ps1 -SkipSystemDeps -Repo file:///Users/kumudusanjeewa/AI_work_together -Dir /tmp/quorum-pwsh-smoke` completed clone/install/build/link, the installer reached its command verification step successfully, and an external temp-prefix `quorum --version` returned `0.8.0`. Cleaned temp smoke folders afterward.

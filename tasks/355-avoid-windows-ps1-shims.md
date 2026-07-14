---
id: 355
title: Avoid Windows PowerShell ps1 shims in installer
status: done
owner: codex-gpt-5
deps: [354]
owned_paths:
  - "install.ps1"
  - "CHANGELOG.md"
  - "tasks/355-avoid-windows-ps1-shims.md"
acceptance:
  - Windows installer prefers `.cmd`/`.exe` command shims over `.ps1` shims for Node tools
  - Installer does not require changing PowerShell execution policy to call npm, pnpm, or quorum
  - Corepack system shim writes are avoided on Windows when pnpm needs installation
  - PowerShell parser and isolated installer smoke checks pass
---
## Notes
User tested in Windows running under Parallels Desktop. `corepack enable` hit `EPERM` writing into `C:\Program Files\nodejs\yarn`, then `npm.ps1` was blocked by PowerShell execution policy. This means the installer must not rely on PowerShell `.ps1` shims on Windows.

## Journal
- [codex-gpt-5] Started after inspecting the latest clean repo and Windows installer. Plan: prefer `.cmd`/`.exe` via a `Tool` resolver for npm/pnpm/corepack/git/node/quorum calls, skip system-level Corepack activation on Windows, install pnpm through npm's `.cmd` shim, and remove Quorum's generated `quorum.ps1` when `quorum.cmd` exists so plain `quorum` can work under restricted execution policy.
- [codex-gpt-5] Implemented the Windows-safe tool resolver and replaced npm/pnpm/git/node/corepack/quorum invocations with resolved native tools. On Windows, the installer now skips `corepack enable` to avoid writes under `C:\Program Files\nodejs`, uses npm's `.cmd` shim for pnpm installation, and removes Quorum's generated `quorum.ps1` after linking when `quorum.cmd` exists. Validation: PowerShell parser check passed, `git diff --check` passed, fresh isolated `pwsh -File ./install.ps1 -SkipSystemDeps -Repo file:///Users/kumudusanjeewa/AI_work_together -Dir /tmp/quorum-pwsh-smoke` completed clone/install/build/link, installer command verification succeeded, and external temp-prefix `quorum --version` returned `0.8.0`. Cleaned temp smoke folders afterward.

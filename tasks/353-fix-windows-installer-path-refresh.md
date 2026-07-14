---
id: 353
title: Fix Windows installer PATH refresh after winget installs Git
status: done
owner: codex-gpt-5
deps: [352]
owned_paths:
  - "install.ps1"
  - "CHANGELOG.md"
  - "tasks/353-fix-windows-installer-path-refresh.md"
acceptance:
  - PowerShell installer refreshes the current process PATH after winget installs prerequisites
  - Standard Git/Node/Python install locations are considered before prerequisite verification
  - Installer parse/smoke checks pass under local PowerShell
  - Task journal records the Windows user failure mode and validation
---
## Notes
User tested the Windows installer on another PC. `winget` reported "Successfully installed" for Git, but the same PowerShell session immediately failed with `git is required`, which means the installer did not see the PATH mutation from the just-completed Git for Windows install.

## Journal
- [codex-gpt-5] Started after reading DESIGN.md, SPEC.md, and the task ledger. Root cause is likely that Git for Windows installed successfully but current PowerShell process PATH did not refresh before `Verify-Prerequisites`. Patching `install.ps1` to reload Process/User/Machine PATH and add standard Git/Node/Python install paths after winget installs and before verification.
- [codex-gpt-5] Implemented `Refresh-ProcessPath` in `install.ps1`, called it before prerequisite checks and after each `winget` install, and added common Git/Node/Python install directories as same-session fallbacks. Also clarified the non-Windows PowerShell smoke-test credential-store message. Validation: PowerShell parser check passed, `git diff --check` passed, isolated `pwsh -File ./install.ps1 -SkipSystemDeps -Repo file:///Users/kumudusanjeewa/AI_work_together -Dir /tmp/quorum-pwsh-smoke` completed clone/install/build/link, and the temp linked `quorum --version` returned `0.8.0`. Cleaned temp smoke folders afterward.

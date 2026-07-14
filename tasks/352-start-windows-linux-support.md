---
id: 352
title: Start Windows and Linux support
status: done
owner: codex-gpt-5
deps: [351]
owned_paths:
  - "install.sh"
  - "install.ps1"
  - "package.json"
  - "scripts/clean.mjs"
  - "packages/daemon/src/secrets.ts"
  - "packages/cli/src/keychain.test.ts"
  - "README.md"
  - "docs/getting-started.md"
  - "docs/configuration.md"
  - "docs/architecture.md"
  - "docs/publishing.md"
  - "docs/index.html"
  - "CHANGELOG.md"
  - "tasks/352-start-windows-linux-support.md"
acceptance:
  - Linux installer messaging and docs clearly cover supported package managers and no-sudo/no-system-deps modes
  - Windows has a first-pass PowerShell installer path for source installs
  - Windows API-key persistence uses Windows Credential Manager or cleanly falls back to env vars
  - Docs and public site show macOS/Linux/Windows setup commands without hiding platform limits
  - build, tests, lint, installer syntax, public-safety, and doc checks pass from the available macOS environment
---
## Notes
User asked to start Windows and Linux support. Current installer already handles macOS/Linux package managers; Windows lacked a first-class installer and secure key persistence.

## Journal
- [codex-gpt-5] Started after reading DESIGN.md, SPEC.md, and the task ledger. First support slice will add Windows install/key persistence and tighten Linux docs, with explicit handoff that actual Windows/Linux VM smoke tests still need to run on those platforms.
- [codex-gpt-5] Added a first-pass Windows PowerShell source installer, guarded the bash installer away from native Windows shells, documented macOS/Linux vs Windows install paths, and added Windows Credential Manager persistence for API keys. Replaced the root clean script with a Node implementation so maintenance commands are not Unix-only. Updated README, docs, public site copy, publishing notes, and changelog. Validation from this macOS environment: `corepack pnpm build`, `corepack pnpm test` (199 tests), `corepack pnpm lint`, `bash -n install.sh`, `node --check scripts/clean.mjs`, `git diff --check`, credential/personal-path scans, and a headless Chrome render of the public docs page. PowerShell is not installed here, so the Windows installer still needs a real Windows/PowerShell smoke test before claiming full platform support.
- [codex-gpt-5] Installed PowerShell 7.6.3 locally via Homebrew and smoke-tested `install.ps1` under `pwsh` using an isolated temp clone, temp npm prefix, and local repo source. The script parsed, cloned, ran `pnpm install`, ran `pnpm build`, linked the CLI, and the isolated `quorum --version` returned `0.8.0`. Cleaned temp folders afterward and left the working tree clean. This validates the PowerShell script shape under `pwsh`; actual Windows-specific `winget` and Windows Credential Manager behavior still needs a real Windows PC smoke test.

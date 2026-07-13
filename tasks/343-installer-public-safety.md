---
id: 343
title: Public safety audit and prerequisite installer
status: done
owner: codex-gpt-5
deps: [342]
owned_paths:
  - "install.sh"
  - "README.md"
  - "docs/getting-started.md"
  - "docs/index.html"
  - "docs/publishing.md"
  - "tasks/343-installer-public-safety.md"
acceptance:
  - tracked repository has no concrete credential patterns, local user paths, session data, daemon tokens, or personal machine artifacts
  - install script can bootstrap required prerequisites on common macOS/Linux systems where a supported package manager exists
  - installer verifies Node >=20, git, pnpm/Corepack, and Python 3; Linux Keychain support is installed when available
  - documentation explains what the installer installs and how to skip system dependency installation
  - `bash -n install.sh`, build, tests, and public-safety scans pass
---
## Notes
User asked to make sure no personal sensitive information is in the public repo and to make the install command install relevant required packages such as Python.

## Journal
- [codex-gpt-5] Started task after reading DESIGN.md, SPEC.md, task ledger, and current install.sh. Initial tracked-file check found no tracked `.quorum/` session/config directories, daemon token files, `.env`, private keys, PEMs, or config.yaml runtime secrets. Next: harden installer and run redacted scans.
- [codex-gpt-5] Hardened `install.sh` to bootstrap prerequisites with Homebrew/apt/dnf/yum/pacman/apk when available: git, Node.js >=20 + npm, Python 3, pnpm/Corepack, and Linux `secret-tool` for secure API-key storage. Added `QUORUM_SKIP_SYSTEM_DEPS=1` and `QUORUM_NO_SUDO=1` escape hatches. Updated README, getting-started docs, docs site, and publishing checklist with the new installer behavior and public-safety checks.
- [codex-gpt-5] Public-safety audit passed for current tracked files and full Git history: no concrete API key/token patterns, private key blocks, local home-directory paths, personal local username, desktop/download artifacts, or tracked secret/session-like files across 77 commits. Validation also passed: `bash -n install.sh`, `git diff --check`, `corepack pnpm build`, `corepack pnpm test` (190 tests), and `corepack pnpm lint`.

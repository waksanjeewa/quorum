---
id: 356
title: Avoid writing Quorum state into Windows System32
status: done
owner: codex-gpt-5
deps: [355]
owned_paths:
  - "packages/cli/src/index.ts"
  - "packages/cli/src/project-root.ts"
  - "packages/cli/src/project-root.test.ts"
  - "README.md"
  - "docs/getting-started.md"
  - "CHANGELOG.md"
  - "tasks/356-safe-project-root-on-windows.md"
acceptance:
  - CLI startup detects protected Windows folders such as C:\Windows\System32
  - CLI falls back to the user's home folder for Quorum state instead of attempting C:\Windows\System32\.quorum
  - Users can still override the state root explicitly
  - Docs mention running Quorum from a project folder and the Windows PowerShell System32 fallback
  - Build, tests, lint, and diff checks pass
---
## Notes
User tested on Windows under Parallels. After successful install, first-run model setup from `C:\WINDOWS\system32` crashed with `EPERM: operation not permitted, mkdir 'C:\Windows\System32\.quorum'`.

## Journal
- [codex-gpt-5] Started after reading DESIGN.md, SPEC.md, and the task ledger. Root cause is that CLI startup uses `process.cwd()` as the project root, and Windows PowerShell often opens in `C:\Windows\System32`. Adding a project-root resolver that avoids protected Windows system folders and unwritable directories, falling back to the user's home directory with a warning.
- [codex-gpt-5] Added `resolveProjectRoot` and wired CLI startup through it. It keeps normal writable folders, honors `QUORUM_PROJECT_ROOT`, detects protected Windows roots such as `C:\Windows\System32`, and falls back to the user's home folder with a warning instead of attempting `C:\Windows\System32\.quorum`. Added unit coverage for normal cwd, explicit override, System32 detection, System32 fallback, and unwritable cwd fallback. Updated README/getting-started docs and changelog. Validation: targeted CLI tests passed, `corepack pnpm build` passed, `corepack pnpm test` passed (204 tests / 29 files), `corepack pnpm lint` passed, and `git diff --check` passed.

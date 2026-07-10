# Changelog

## 0.7.0
- **Publishable**: the CLI now bundles into a single self-contained file (`scripts/bundle-cli.mjs`,
  run on `prepack`), so `npm install -g quorum` works with no workspace packages. The agent SDKs
  stay as `optionalDependencies`.
- `quorum --version` / `--help` (`-v` / `-h`).

## 0.6.0
- **Phase 3**: parallel executors (concurrency scheduler with `owned_paths` leases + serialized
  merges) and a **VS Code extension** hosting the dashboard as a webview.
- **Benchmark** harness (`bench/`) — first run: the roundtable beat a single model 2/0, judged blind.

## 0.5.0
- **Review gate**: a model reviews each executor diff before merge ("tests pass" is necessary, not sufficient).
- **`quorum resume`**: reopen a stopped/crashed session from disk.
- **Cross-platform**: Linux Keychain (`secret-tool`), shell-agnostic acceptance runner.
- **Live "thinking"** indicator; CONTRIBUTING + issue/PR templates.

## 0.4.0
- **Frugal mode**: free models draft, paid models verify & improve.
- Live progress heartbeat; **dashboard settings** panel; `quorum doctor` prerequisite checks.
- Docs (getting-started, configuration, architecture) with Mermaid diagrams.

## 0.3.0
- Autonomous `quorum start` (goal → plan → build); interactive shell with `/models` picker;
  macOS Keychain key storage; `quorum init` / `doctor`.

## 0.2.0
- Phase 2 (the Workshop): executors edit code in isolated git worktrees, verified and merged.

## 0.1.0
- Phase 1 (the roundtable): multi-model deliberation, usage-limit failover, human injection, kill switch.

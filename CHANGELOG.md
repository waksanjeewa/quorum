# Changelog

## 0.8.0
- **Public-launch polish**: dashboard header/compose now use the real Quorum consensus-table logo,
  and the CLI launch banner combines that compact mark with the correct ASCII `QUORUM` word.
- Dashboard and public docs now show the current public version (`v0.8.0`).
- GitHub README now uses a custom dark Quorum hero graphic, contributor attribution, and a clearer
  at-a-glance product flow.
- GitHub README now surfaces the one-line install command immediately under the repo badges and uses
  a shorter, less cramped hero graphic.
- README hero no longer embeds the long install command, preventing clipped text while keeping the
  install command copyable above the fold.
- Public webpage now includes a visual terminal → dashboard → verified merge walkthrough.
- Interactive shell `/` menu now supports terminal-popup discovery with ↑/↓ selection and Enter.
- Dashboard now has working **New roundtable**, a left-side roundtable list, and active
  model/activity chips under **Activity**.
- Frugal mode is now explicit: use `/frugal` in the terminal or the dashboard **Frugal** controls to
  pick free drafting models and paid/subscription verifier models.
- Changing models from the terminal keeps the existing dashboard port/URL; refresh the same browser
  tab to see the new settings.
- Dashboard startup is now resilient: it opens to the New roundtable composer immediately, normalizes
  partial local settings data, and shows an inline retry prompt instead of a header-only/blank body.
- Started first-class Windows/Linux support: added a Windows PowerShell source installer, documented
  platform-specific install commands, and added Windows Credential Manager API-key persistence.
- Selecting Ollama now lets you choose the specific local free model instead of silently using
  `ollama/llama3`; dashboard Settings also lists installed Ollama models when reachable.
- Terminal launch logo alignment tightened so the compact mark and ASCII `QUORUM` word sit cleanly
  together.
- Vague first messages ask a clarification question instead of starting the wrong goal; `/goal …`
  still starts directly.
- Brainstorm turn-budget exhaustion soft-advances toward planning when possible instead of
  stopping while other models are available.
- Docs refreshed for the current CLI/dashboard UX and public repository launch.

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

---
id: 270
title: Interactive shell + no-file-editing model setup + secure key storage
status: done
owner: claude-opus-4-8
deps: [250, 260]
owned_paths: ["packages/cli/src/repl.ts", "packages/cli/src/setup.ts", "packages/cli/src/keychain.ts", "packages/cli/src/index.ts"]
acceptance:
  - `quorum` (no args) enters an interactive shell; type a goal to run, plain text while running injects, `/` commands control it (/models /doctor /status /pause /resume /stop /config /help /exit)
  - `quorum setup` / `/models` lets the user PICK models (no file editing) — detects logins, and for API providers captures the key into the macOS Keychain (never a file); writes .quorum/config.yaml
  - keys resolve from Keychain at run time (real env var wins); credentials never written to disk
  - buildConfigYaml + runSetup + keychain unit-tested; interactive shell smoke-tested
---
## Notes
User asked for a Claude-CLI-style experience: stay inside `quorum`, use `/` to change settings, and pick models interactively instead of editing YAML. Security refinement: API keys go to the OS Keychain, not a dotfile (Quorum principle: creds never in files).

## Journal
- [claude-opus-4-8] Built the interactive shell + no-file-editing setup (139 tests). repl.ts: readline loop, streams events above the prompt (rl.prompt(true) preserves input), plain text = goal (idle) or inject (running), `/` commands, Ctrl+C interrupts→stops (twice exits). Boots a QuorumHttpServer per goal (autonomous, dashboard URL) with Keychain-resolved env. setup.ts: runSetup detects claude/codex/ollama via doctorReport, lets the user pick, captures OpenRouter key → Keychain, writes config; buildConfigYaml is a pure/tested generator (distributes primaries across proposer/critic/arbiter + ollama fallback). keychain.ts: macOS `security` add/find/delete-generic-password under service "quorum", account = env-var name; resolveSecretsEnv layers stored keys under env (real env wins); non-macOS → env-only fallback. index.ts: no-args → repl; `setup`/`models` alias; `start` resolves Keychain env too.
  - TESTABILITY: detection injectable (runSetup opts.detect) so the full wizard flow is unit-tested with a fake readline + fake detector (no TTY/network). Keychain round-trip tested on macOS (it.runIf). ask() guarded against readline-closed (piped-stdin EOF race — harmless in a real TTY).
  - Known: piping input to `quorum setup` can race (async detection vs pipe EOF) — real terminal is fine. Goal execution in the REPL reuses the proven autonomous daemon pipeline (task 250).
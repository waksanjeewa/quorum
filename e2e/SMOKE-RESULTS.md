# Smoke Test Results — 2026-07-09

First live run of Quorum against real models (Claude opus-4-8 operator). Environment: macOS,
Node 25, Ollama 0.30.11, codex-cli 0.132.0 + @openai/codex-sdk 0.143.0, claude-code 2.1.131.

## ✅ Verified working with real models

| Path | Result |
|---|---|
| **Ollama adapter** (`gemma3:1b`, local) | Real turn in ~2.5s, content parsed, `auth()` reachable ✓ |
| **Full pipeline on Ollama** | `quorum start` booted daemon, 3 seats took role-appropriate turns, streamed live, wrote `transcript.jsonl` + `summary.md`, turn-budget pause fired ✓ |
| **Codex subscription auth (headless)** | `codex exec` returned READY — the login our adapter reuses ✓ |
| **Codex SDK adapter** | Real turn via `@openai/codex-sdk`, `auth()` reused `~/.codex` login, SDK shape (`finalResponse`, `thread.id`) matched the adapter ✓ |
| **Full convergence on Codex** | 2 Codex seats **converged brainstorm→plan**, wrote real `spec.md` + `ideas.md` recommending Python with a browser-first caveat ✓ |

## 🐛 Bugs found & fixed during smoke

1. **Codex adapter failed outside a git repo.** The SDK errors "Not inside a trusted directory" unless
   `skipGitRepoCheck` is set. Fixed: the adapter now passes `{ skipGitRepoCheck: true, sandboxMode: "read-only" }`.
   (Deliberation never writes files, so read-only is correct.)
2. **Injection swallowed mid-turn** (found earlier via e2e): fixed with `addressedHumanCount` tracking.

## ⚠️ Known limitations / not verified here

- **Claude adapter not verifiable in this environment.** These smoke runs executed *inside* a Claude
  Code session (`CLAUDECODE=1`), whose `ANTHROPIC_BASE_URL` routing makes a nested headless `claude`
  return 401. A normal terminal login is unaffected — **verify the Claude seat from a plain terminal**
  (`CLAUDE_TEST=1`): confirm the Agent SDK `query()` message shapes (assistant text / `result` / `session_id`).
- **Codex `probeQuota` is a no-op** (`{}`), so Codex handoff is currently reactive-only. Proactive
  handoff needs the app-server `account/rateLimits/read` call wired directly. Safe; follow-up.
- **Ollama cloud models** (`glm-5.1:cloud`, `gemma4:31b-cloud`) return **403** without ollama.com auth.
  Local models (`gemma3:1b`) work. Small local models mangle the `move:` syntax so they never converge
  cleanly (the parser correctly rejects malformed moves) — convergence needs a capable model.

## Verdict

The core thesis is proven with real models: **multiple models deliberate over a shared transcript,
converge, and hand off — and a session survives running in any directory.** Ready to iterate toward a
public release once the Claude seat is confirmed from a plain terminal.

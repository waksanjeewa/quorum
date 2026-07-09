# Quorum

**Your AI session never dies.** Multiple AI models collaborate on one goal — brainstorming,
planning, and building together — handing off to each other when usage limits hit, with you able to
step in at any moment without stopping the work.

Quorum is **local-first**: no server, no accounts, no telemetry. Your prompts and credentials never
leave your machine. It reuses the logins you already have (Claude Code, Codex) and can fall back to
API models or a local Ollama model so a session can run for free.

> Status: **Phase 1 (the roundtable)** and the **Phase 2 core (the Workshop)** are implemented and
> tested. Models deliberate over a shared transcript, hand off on usage limits, and you can inject
> live — then executor agents carry out the plan by editing code in isolated git worktrees, verified
> and merged. All four adapters (Claude, Codex, OpenRouter, Ollama) are verified against live models
> (see [e2e/SMOKE-RESULTS.md](e2e/SMOKE-RESULTS.md)). See [DESIGN.md](DESIGN.md) for the full vision
> and [tasks/](tasks/) for the build ledger.

## How it works

Multiple models sit at a table with distinct roles — **proposer**, **critic**, **arbiter** — and
deliberate turn by turn over a shared transcript until they converge on an answer. All state lives in
plain files on disk, so **no agent ever owns the task**: when one model's usage window closes, the
next model in that seat's failover chain reads the transcript and picks up exactly where it left off.
If every primary is exhausted, a free local model keeps things going.

```
Goal → [Roundtable: brainstorm] → [Roundtable: plan] → spec.md + tasks/
        proposer · critic · arbiter, with you able to inject anytime
```

## Getting started

**Install** (while the repo is private, install from source):

```bash
curl -fsSL https://raw.githubusercontent.com/waksanjeewa/quorum/main/install.sh | bash
# or: git clone https://github.com/waksanjeewa/quorum && cd quorum && ./install.sh
```

*(Once published, the one-liner will be `npm install -g quorum`.)*

**Log in to the models you want** — Quorum reuses logins you already have, no API keys required:

```bash
claude login      # for a `claude` seat (Claude Max/Pro)
codex login       # for a `codex` seat (ChatGPT Plus/Pro)
# optional: export OPENROUTER_API_KEY=...   for OpenRouter (free & paid models)
# optional: ollama serve                    for a free local fallback
```

**Then:**

```bash
quorum init                       # scaffold .quorum/config.yaml
quorum doctor                     # see which seats are ready
quorum start "build me a CLI that converts CSV to JSON"
```

In a **git repo**, `start` runs the whole thing autonomously — the models deliberate, converge on a
plan, then an executor builds it in an isolated worktree, verifies it, and merges. In a non-git
directory it deliberates and produces a plan (`git init` to enable building). Open the printed
dashboard URL to watch live, drop in a message, or hit **STOP**.

Commands: `quorum init` · `doctor` · `start "<goal>"` · `status` · `inject "<msg>"` · `pause` ·
`resume` · `stop` · `attach`.

## Configuration

Create `.quorum/config.yaml` in your project. Each seat has a **failover chain** — tried in order:

```yaml
seats:
  proposer: { chain: [claude, openrouter/deepseek/deepseek-chat:free, ollama/llama3] }
  critic:   { chain: [codex,  openrouter/deepseek/deepseek-chat:free, ollama/llama3] }
  arbiter:  { chain: [openrouter/google/gemini-2.5-pro, ollama/llama3] }
budgets:
  max_turns_per_stage: 12
providers:
  openrouter: { base_url: "https://openrouter.ai/api/v1", key_env: OPENROUTER_API_KEY }
```

- `claude` / `codex` reuse your existing subscription logins — no API key needed.
- `<provider>/<model>` uses the generic OpenAI-compatible client — OpenRouter (free & paid), a local
  [OmniRoute](https://github.com/diegosouzapw/OmniRoute)/LiteLLM gateway, or a direct API.
- `ollama/<model>` is the never-offline free fallback.

API keys come from environment variables only — never stored in files.

## Architecture

A TypeScript / pnpm monorepo (`core ← adapters ← daemon ← cli`; the dashboard is served over HTTP):

| Package | Role |
|---|---|
| `@quorum/core` | Types, the on-disk ledger, and the roundtable engine |
| `@quorum/adapters` | Model adapters (Claude, Codex, Ollama, generic HTTP) + failover seat manager |
| `@quorum/daemon` | Session manager + local HTTP/SSE API |
| `@quorum/dashboard` | Self-contained local web UI |
| `quorum` (cli) | The command-line entry point |

Run the tests with `corepack pnpm test`. For a manual check against real models, see
[e2e/SMOKE.md](e2e/SMOKE.md).

## License

MIT — see [LICENSE](LICENSE).

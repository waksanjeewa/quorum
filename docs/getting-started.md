# Getting Started

Quorum is local-first: everything runs on your machine, your credentials never leave it.

## 1. Prerequisites

| Requirement | Why | Install |
|---|---|---|
| **Node.js ≥ 20** | Quorum runs on Node | [nodejs.org](https://nodejs.org) or `brew install node` |
| **git** | required for autonomous *building* (isolated worktrees + merges) | `xcode-select --install` (macOS) or `brew install git` |
| At least **one model** (below) | someone has to sit at the table | — |

**Models — bring any of these (mix freely):**

| Model | What you need | Cost |
|---|---|---|
| **Claude** (recommended orchestrator) | [Claude Code](https://claude.com/claude-code) installed + `claude login` (Pro/Max plan) | subscription |
| **Codex** (recommended orchestrator) | [Codex CLI](https://developers.openai.com/codex) installed + `codex login` (ChatGPT plan) | subscription |
| **Ollama** (free, local) | [ollama.com](https://ollama.com) → `ollama serve` + `ollama pull llama3` | free |
| **OpenRouter** (huge catalog incl. free) | an API key from [openrouter.ai](https://openrouter.ai) | free & paid |
| **OpenAI / Anthropic / Gemini APIs** | an API key | paid |

> Claude and Codex are the recommended primary seats: they're the only models that can **execute**
> (edit files, run commands), so autonomous building needs at least one of them. Everything else
> can deliberate, draft, and verify.

## 2. Install

```bash
curl -fsSL https://raw.githubusercontent.com/waksanjeewa/quorum/main/install.sh | bash
```
(or `git clone https://github.com/waksanjeewa/quorum && cd quorum && ./install.sh`)

Then check your machine:

```bash
quorum doctor
```

`doctor` verifies node, git, and every configured model — with an actionable hint for anything missing.

## 3. Pick your models (no config files)

```bash
quorum
```

The first run drops you straight into the model picker:

- Logged-in tools (Claude, Codex, Ollama) are detected automatically — just pick their numbers.
- For API providers (OpenRouter/OpenAI/Anthropic), paste your key once — it's stored in your
  **OS Keychain**, never in a file — then pick the exact model from the live catalog
  (free models listed first and flagged).
- If you mix free and paid models, Quorum offers **frugal mode**: free models do the bulk
  drafting, paid models only verify and improve.

## 4. Give it a goal

```
◆ quorum › build me a CLI that converts CSV to JSON
```

You'll see the roundtable live — proposer, critic, and arbiter debating in different colors, a
heartbeat line while models think, and a **dashboard URL** you can open to watch in the browser,
tweak settings, or hit STOP.

- In a **git repo**, Quorum goes all the way: plan → decompose → **build in an isolated worktree →
  verify → merge**.
- Anywhere else it deliberates and delivers a plan (`git init` to unlock building).
- Type anything mid-run to steer the table. `/pause`, `/stop`, `/agents` for who's doing what.

## 5. Cheat sheet

| Command | Does |
|---|---|
| `quorum` | interactive shell (recommended) |
| `/models` | pick/change models, add API keys |
| `/agents` | seats, current task, elapsed time |
| `/doctor` | readiness check |
| `/pause` `/resume` `/stop` | control the run |
| `quorum start "<goal>"` | one-shot, non-interactive |

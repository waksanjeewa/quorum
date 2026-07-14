# Getting Started

Quorum is local-first: everything runs on your machine, your credentials never leave it.

## 1. Prerequisites

| Requirement | Why | Install |
|---|---|---|
| **Node.js ≥ 20** + npm | Quorum runs on Node and builds the CLI bundle | the installer tries Homebrew/apt/dnf/yum/pacman/apk first |
| **git** | required for autonomous *building* (isolated worktrees + merges) | installed by the source installer when possible |
| **Python 3** | common project/acceptance-test runtime for generated code | installed by the source installer when possible |
| **Linux `secret-tool`** | optional secure API-key storage on Linux | installed as `libsecret-tools`/`libsecret` when possible |
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

The installer bootstraps the local toolchain where it can: Node.js ≥20, npm, git, Python 3,
pnpm/Corepack, and Linux Keychain support (`secret-tool`). If you prefer to install system packages
yourself first, opt out of package-manager changes:

```bash
QUORUM_SKIP_SYSTEM_DEPS=1 curl -fsSL https://raw.githubusercontent.com/waksanjeewa/quorum/main/install.sh | bash
```

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
- When you pick **Ollama**, Quorum lists the local models from `ollama serve` / `ollama list`;
  if Ollama is offline, you can still type any model name you already pulled.
- For API providers (OpenRouter/OpenAI/Anthropic), paste your key once — it's stored in your
  **OS Keychain**, never in a file — then pick the exact model from the live catalog
  (free models listed first and flagged).
- If you mix free and paid models, Quorum offers **frugal mode**: free models do the bulk
  drafting, paid models only verify and improve.
- Want to choose those deliberately? Run `/frugal`, or use the dashboard **Frugal** button /
  **Settings → Frugal mode** to pick free draft models and paid verifier models.

## 4. Give it a goal

```
◆ quorum ❯ build me a CLI that converts CSV to JSON
```

You'll see the roundtable live — proposer, critic, and arbiter debating in different colors, a
heartbeat line while models think, and a **dashboard URL** you can open to watch in the browser,
tweak settings, or hit STOP.

- In a **git repo**, Quorum goes all the way: plan → decompose → **build in an isolated worktree →
  verify → merge**.
- Anywhere else it deliberates and delivers a plan (`git init` to unlock building).
- The dashboard opens to a usable **New roundtable** composer even while local settings are loading.
  If it cannot read local session/settings data yet, use the inline **Retry now** prompt or refresh
  the same tab.
- Changing models from `/models`, `/frugal`, or dashboard Settings keeps the same dashboard URL/port.
  Refresh that browser tab to see the latest model catalog and seat chains.
- Type `/` to open the command popup. Use ↑/↓ and Enter to choose commands like `/models`,
  `/frugal`, `/doctor`, `/dashboard`, `/pause`, `/resume`, `/stop`, and `/status`.
- Type anything mid-run to steer the table. `/agents` shows the current seats/activity from the
  terminal; the dashboard also lists every roundtable on the left and shows active agents under
  **Activity**.
- If your first message is unclear, Quorum asks a follow-up question instead of starting the wrong
  goal. Prefix with `/goal` when you intentionally want to skip that check.

## 5. Cheat sheet

| Command | Does |
|---|---|
| `quorum` | interactive shell (recommended) |
| `/models` | pick/change models, add API keys |
| `/frugal` | choose free draft models + paid verifier models |
| `/agents` | seats, current task, elapsed time |
| `/dashboard` | open the live local dashboard |
| `/doctor` | readiness check |
| `/pause` `/resume` `/stop` | control the run |
| `quorum start "<goal>"` | one-shot, non-interactive |
| `quorum resume [id]` | reopen a stopped/crashed session (latest if no id) |

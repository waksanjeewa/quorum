# Configuration

Everything lives in one file per project: `.quorum/config.yaml`. You rarely edit it by hand —
`/models` in the shell writes it, and the **dashboard ⚙ Settings** panel edits it live (validated
on save, applies to the next session).

## The model id language

A seat's `chain` is a **failover list**, tried in order. Ids:

| Form | Example | Meaning |
|---|---|---|
| `claude` | `claude` | your Claude Code login, account-default model |
| `claude/<model>` | `claude/claude-opus-4-8` | a specific Claude model |
| `codex` | `codex` | your Codex (ChatGPT) login, default model |
| `codex/<model>` | `codex/gpt-5.5` | a specific OpenAI model via your login |
| `ollama/<model>` | `ollama/llama3` | a local Ollama model — free, never rate-limited |
| `<provider>/<model>` | `openrouter/nousresearch/hermes-3-llama-3.1-405b:free` | any OpenAI-compatible provider from your `providers:` map |
| built-in aggregators | `openrouter/…`, `groq/…`, `together/…`, `fireworks/…`, `deepinfra/…` | one key unlocks many models (no `providers:` block needed) |
| built-in APIs | `openai-api/gpt-5.5`, `anthropic-api/claude-opus-4-8`, `gemini-api/gemini-2.5-pro` | direct API access (key from env/Keychain) |

Models ending in `:free` cost nothing (OpenRouter's free tier). Free models can deliberate but not
execute; **only `claude`/`codex` seats can build**.

### One key, many models (skip multiple subscriptions)

Don't want to pay for several AI services? A single **aggregator** key unlocks dozens of models and
Quorum can seat several of them at once — a full roundtable from one login:

```yaml
seats:
  proposer: { chain: [groq/llama-3.1-8b-instant] }          # fast + free tier drafts
  critic:   { chain: [groq/llama-3.3-70b-versatile] }        # a bigger model critiques
  arbiter:  { chain: [groq/deepseek-r1-distill-llama-70b] }  # a third decides
# no providers: block needed — groq/together/fireworks/deepinfra/openrouter are built in
```

| Aggregator | Prefix | Key env |
|---|---|---|
| GitHub Models (Copilot/GitHub users) | `github/…` | `GITHUB_TOKEN` |
| OpenRouter | `openrouter/…` | `OPENROUTER_API_KEY` |
| Groq | `groq/…` | `GROQ_API_KEY` |
| Together AI | `together/…` | `TOGETHER_API_KEY` |
| Fireworks AI | `fireworks/…` | `FIREWORKS_API_KEY` |
| DeepInfra | `deepinfra/…` | `DEEPINFRA_API_KEY` |

**GitHub Copilot users:** `GITHUB_TOKEN` is a fine-grained PAT with the **Models** permission (or the
output of `gh auth token`). GitHub Models gives GPT-4o, Llama, Mistral and more on the free tier —
e.g. `github/gpt-4o-mini` — so you can run the roundtable on your GitHub login plus any free model.
(Like other aggregators, GitHub models deliberate and verify; building still needs `claude`/`codex`.)

In `/models`, pick an aggregator and Quorum offers to **auto-spread** its models across the three
seats. To also **build code autonomously**, add a `claude` or `codex` login — those two are the only
executors that edit files; an `openrouter/anthropic/claude-…` is chat-only and can't drive the build.
(OpenRouter still needs its `providers:` entry, which `/models` writes for you.)

## Full example (frugal: free drafts, paid verifies)

```yaml
seats:
  proposer:            # drafts — volume work on free models first
    chain: [ollama/llama3, openrouter/deepseek/deepseek-chat:free, claude]
  critic:              # verifies — paid judgement first
    chain: [claude/claude-opus-4-8, ollama/llama3]
  arbiter:             # decides — a different paid model when possible
    chain: [codex/gpt-5.5, ollama/llama3]
budgets:
  max_turns_per_stage: 12
  max_cost_usd: 5.0    # hard stop for API spend
  wall_clock_max: 2h   # hard stop on time
providers:
  openrouter:
    base_url: "https://openrouter.ai/api/v1"
    key_env: OPENROUTER_API_KEY     # resolved from env or your OS Keychain
```

Notes:
- **Frugal mode** (offered automatically in `/models` when you mix free + paid) generates exactly
  this shape: proposer free-first, critic/arbiter paid-first. Paid quota buys judgement, not volume.
- **Failover** is per-seat: when a model hits its usage limit, the next in the chain picks up the
  same seat mid-conversation. Sessions never die.
- Keys are **never stored in files** — env vars or the OS Keychain (`/models` handles this).

## Budgets & safety

| Key | Effect |
|---|---|
| `max_turns_per_stage` | pause and ask the human if a stage doesn't converge in N turns |
| `max_cost_usd` | stop when cumulative API cost hits the cap (subscription seats don't count) |
| `wall_clock_max` | stop after e.g. `2h` / `90m` |

Plus always-on rails: STOP kills everything instantly; building happens in isolated git worktrees;
nothing merges until the task's acceptance commands pass; Quorum never pushes or deploys.

## Agents & execution (the swarm)

When building, Quorum runs an **agent swarm** — independent tasks execute in parallel, each in its own
worktree — and executor agents (Claude) can spawn **subagents** (the Task tool) when they judge a task
warrants fanning out. Both are toggleable in the dashboard **⚙ Settings → Agents & execution**, or in
config:

```yaml
execution:
  parallel: true        # run independent tasks at once (a swarm); false ⇒ one at a time
  max_concurrency: 4    # cap on concurrent agents; omit for auto (min(4, cores-1))
  subagents: true       # let Claude executors spawn subagents (Task tool) when useful
```

- **parallel / max_concurrency** control the swarm width. The models don't need to ask — the planner
  decomposes the goal into tasks with dependencies, and any that are independent run concurrently
  (up to the cap). Set `parallel: false` for strictly sequential, easier-to-follow runs.
- **subagents** grants the Claude executor the Task tool, so *it* decides when to delegate to a
  subagent (e.g. a big task with separable parts). Turn it off to keep each task a single agent.
  (Codex executes as a single agent; the subagent toggle applies to Claude executors.)

## Hermes, gateways, and other platforms

- **Nous Hermes** (and hundreds of others) work today via OpenRouter:
  `openrouter/nousresearch/hermes-3-llama-3.1-405b:free`.
- **Any OpenAI-compatible endpoint** — a local [OmniRoute](https://github.com/diegosouzapw/OmniRoute)
  or LiteLLM gateway, a lab's API — plugs in as a `providers:` entry. You inherit that gateway's
  own routing/fallback *underneath* Quorum's seat chains.
- **New agent platforms** (things that aren't a plain chat API) integrate by implementing the small
  `ModelAdapter` interface in `@quorum/adapters` — `auth()`, `capabilities()`, `takeTurn()` — and
  pass the shared contract test suite. That's the whole surface; PRs welcome.

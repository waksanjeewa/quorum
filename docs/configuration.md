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
| built-in APIs | `openai-api/gpt-5.5`, `anthropic-api/claude-opus-4-8`, `gemini-api/gemini-2.5-pro` | direct API access (key from env/Keychain) |

Models ending in `:free` cost nothing (OpenRouter's free tier). Free models can deliberate but not
execute; **only `claude`/`codex` seats can build**.

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

## Hermes, gateways, and other platforms

- **Nous Hermes** (and hundreds of others) work today via OpenRouter:
  `openrouter/nousresearch/hermes-3-llama-3.1-405b:free`.
- **Any OpenAI-compatible endpoint** — a local [OmniRoute](https://github.com/diegosouzapw/OmniRoute)
  or LiteLLM gateway, a lab's API — plugs in as a `providers:` entry. You inherit that gateway's
  own routing/fallback *underneath* Quorum's seat chains.
- **New agent platforms** (things that aren't a plain chat API) integrate by implementing the small
  `ModelAdapter` interface in `@quorum/adapters` — `auth()`, `capabilities()`, `takeTurn()` — and
  pass the shared contract test suite. That's the whole surface; PRs welcome.

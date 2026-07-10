# Contributing to Quorum

Thanks for your interest! Quorum is a local-first, multi-model orchestration tool. It's designed so
**any agent — human or AI — can pick up work from disk**, so the contribution flow mirrors that.

## Setup

```bash
git clone https://github.com/waksanjeewa/quorum && cd quorum
corepack pnpm install
corepack pnpm build
corepack pnpm test      # 160+ tests, all should pass
```

Node ≥ 20, pnpm (via `corepack`), TypeScript strict, ESM. Monorepo dependency direction is
`core ← adapters ← daemon ← cli`; the dashboard talks HTTP/SSE only — please keep it that way.

## How the codebase is organized

Read these before a substantial change:
1. [DESIGN.md](DESIGN.md) — what we're building and why (decisions are settled).
2. [SPEC.md](SPEC.md) — stack, layout, interfaces, contracts.
3. `tasks/` — the task ledger; each file is a unit of work with acceptance criteria and a journal.

If you pick up a `tasks/` item, set it `in_progress`, and **append a journal entry** describing what
you did, what's next, and any gotcha — that's the handoff mechanism.

## Adding a new model / provider

Implement the `ModelAdapter` interface in `packages/adapters` (`auth`, `capabilities`, `takeTurn`,
optional `probeQuota`) and make it pass the shared contract suite
(`describeAdapterContract(...)`). See `ollama-adapter.ts` for the simplest example and the
[configuration docs](docs/configuration.md#hermes-gateways-and-other-platforms).

## Pull requests

- Small, focused commits; imperative messages. Prefix task commits with the id: `[042] add X`.
- **Every change needs tests.** Run `pnpm test` and don't claim green without it.
- No new runtime dependencies without a clear justification in the PR.
- Never store credentials in files — env vars / OS keychain / existing CLI logins only.

## Reporting bugs / ideas

Use the issue templates. For anything security-sensitive (credential handling, the executor
sandbox), please open a private report rather than a public issue.

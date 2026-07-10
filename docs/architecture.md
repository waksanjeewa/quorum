# Architecture

Quorum's founding principle: **no agent ever owns the task.** All state — the conversation, the
plan, the task ledger — lives in plain files on disk. Any model can take any seat at any time, so
handoff isn't failover, it's the normal lifecycle.

## The pipeline

```mermaid
flowchart LR
    G([Your goal]) --> B[Brainstorm<br/><i>roundtable debates approaches</i>]
    B --> P[Plan<br/><i>converge on a spec</i>]
    P --> D[Decompose<br/><i>spec → concrete tasks</i>]
    D --> E[Execute<br/><i>Claude/Codex builds each task<br/>in an isolated git worktree</i>]
    E --> V{Acceptance<br/>passes?}
    V -- yes --> M[Merge to your branch]
    V -- no --> E
    M --> Done([Committed, verified code])
    style G fill:#d946ef,color:#fff
    style Done fill:#16a34a,color:#fff
```

Deliberation stages work anywhere (plans, documents, decisions); the execute stage needs a git repo.

## The roundtable

```mermaid
sequenceDiagram
    participant You
    participant Proposer as Proposer (e.g. free model)
    participant Critic as Critic (e.g. Claude)
    participant Arbiter as Arbiter (e.g. Codex)
    Proposer->>Critic: propose an approach
    Critic->>Arbiter: attack weaknesses (anti-sycophancy: no early approvals)
    You-->>Critic: inject a message anytime — next turn must address it
    Arbiter->>Proposer: weigh both, drive to a decision
    Proposer->>Critic: PROPOSE_CONVERGE (draft artifact)
    Critic->>Arbiter: APPROVE / BLOCK with reason
    Note over Proposer,Arbiter: majority wins, arbiter breaks ties → artifact written
```

## Usage-limit failover (why sessions never die)

```mermaid
flowchart LR
    subgraph seat [one seat's failover chain]
      A[claude] -- "usage limit hit" --> B[openrouter/…:free] -- "rate limited" --> C[ollama/llama3]
    end
    T[(transcript.jsonl<br/>on disk)] -. every model reads the same shared state .-> A & B & C
```

The transcript is the brain, not any model's context window. When a seat's model hits its window,
the next one in the chain reads the transcript tail (plus a rolling summary) and continues the same
seat mid-conversation. If an **executor** hits its limit mid-task, the next Claude/Codex resumes in
the **same worktree**.

## Components

```mermaid
flowchart TB
    CLI[quorum CLI / interactive shell] --> Daemon
    Dash[Web dashboard<br/>transcript · inject · settings · STOP] -- "localhost HTTP + SSE<br/>(bearer token)" --> Daemon
    Daemon[Daemon<br/>sessions · seats · failover · budgets] --> Core
    Core[Engine<br/>roundtable · decompose · execute · ledger] --> Disk[(.quorum/<br/>transcript · spec · tasks · worktrees)]
    Daemon --> Adapters[Adapters]
    Adapters --> Claude[Claude Agent SDK<br/>subscription login]
    Adapters --> Codex[Codex SDK<br/>ChatGPT login]
    Adapters --> HTTP[OpenAI-compatible HTTP<br/>OpenRouter · gateways · direct APIs]
    Adapters --> Ollama[Ollama<br/>local & free]
```

Monorepo dependency direction: `core ← adapters ← daemon ← cli`; the dashboard talks HTTP/SSE only.

## Cost policy (frugal mode)

Free models are excellent at volume (drafting, exploring options); paid models are worth their cost
for judgement (verifying, catching flaws, deciding). Frugal mode encodes exactly that:

| Seat | Chain order | Spends |
|---|---|---|
| Proposer (volume) | free → paid | ~nothing |
| Critic (verification) | paid → free | quality tokens only |
| Arbiter (decisions) | a different paid → free | quality tokens only |
| Executor (building) | always Claude/Codex | subscription |

## Security model

- Local only: daemon binds `127.0.0.1`, per-run bearer token; the dashboard is served locally.
- Credentials: existing CLI logins are reused as-is; API keys live in env vars or the OS Keychain —
  **never in files**.
- Building: isolated worktrees, acceptance-gated merges, no pushes/deploys, instant kill switch.

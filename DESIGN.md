# Quorum — v1 Architecture & Design

> **One-liner:** Your AI session never dies. Multiple AI models collaborate on one goal — brainstorming, planning, and building together — handing off to each other when usage limits hit, with you able to step in at any moment without stopping the work.

*Status: draft for discussion — nothing here is final.*

---

## 1. Core principles

1. **No agent ever owns the task.** All state — the conversation, the plan, the task list, progress notes — lives in plain files on disk. Any model can take any seat at any time. Handoff is not an exceptional failover event; it is the normal lifecycle.
2. **Local-first.** No server, no accounts, no telemetry. GitHub is only for distribution. Prompts, transcripts, and credentials never leave the user's machine.
3. **The human is a participant, not an operator.** You can inject a message into the work at any time without pausing it, and you hold a kill switch that stops everything instantly.
4. **Ship in useful slices.** Each phase is a complete, usable tool on its own.

## 2. Two engines, one pipeline

The product is a pipeline of stages. Deliberation stages are task-agnostic (works for code, documents, business plans, anything); only execution is task-specific.

```
Goal
 └─► ROUNDTABLE: brainstorm      (models debate approaches)
      └─► ROUNDTABLE: plan/design (converge on spec + task breakdown)
           └─► outputs: spec.md + tasks/
                └─► WORKSHOP: execute   (agents work through tasks)
                     └─► ROUNDTABLE: review (models critique the result)
                          └─► done, or loop back
```

- **Roundtable** — N models share one transcript and deliberate: propose, critique, refine, converge. Output is an artifact (ideas doc, spec, task list, review verdict).
- **Workshop** — agents execute tasks from the ledger in isolated workspaces (git worktree per agent for code; separate files for documents). *Phase 2 — see roadmap.*

Non-dev tasks skip or simplify the workshop: "execution" is writing documents rather than code.

## 3. System components

```
┌─────────────────────────────────────────────────────────┐
│  DASHBOARD (local web UI, http://localhost:PORT)        │
│  transcript view · inject box · seat status · STOP/PAUSE│
└──────────────────────┬──────────────────────────────────┘
                       │ local HTTP + WebSocket
┌──────────────────────┴──────────────────────────────────┐
│  DAEMON (Node/TypeScript)                                │
│  ├─ Session manager   (create/resume/stop sessions)     │
│  ├─ Scheduler         (turn-taking, stage transitions)  │
│  ├─ Seat manager      (assign models to seats, failover)│
│  ├─ Injection queue   (human messages spliced at turn   │
│  │                     boundaries)                       │
│  └─ Ledger writer     (transcript, spec, tasks on disk) │
└──────┬──────────────┬──────────────┬────────────────────┘
       │              │              │
 ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐
 │ Adapter:  │  │ Adapter:  │  │ Adapter:  │   ... one per
 │ CLI agent │  │ API model │  │ local LLM │   provider
 │ (claude,  │  │ (anthropic│  │ (ollama)  │
 │  codex)   │  │  openai,  │  │           │
 │           │  │  gemini)  │  │           │
 └───────────┘  └───────────┘  └───────────┘
```

Everything is one installable package: `npm install -g quorum` → `quorum start` launches the daemon and opens the dashboard. A CLI (`quorum status`, `quorum stop`, `quorum inject "..."`) covers headless use.

## 4. On-disk layout (the source of truth)

Each session is a directory. Files are human-readable so users can inspect, edit, or version them.

```
.quorum/
├── config.yaml            # seats, failover chains, budgets (per-project)
└── sessions/
    └── 2026-07-06-payment-api/
        ├── goal.md            # the objective, written by the human
        ├── transcript.jsonl   # append-only event log (the shared brain)
        ├── spec.md            # converged output of plan/design stage
        ├── tasks/             # task ledger (one file per task)
        │   ├── 001-schema.md  #   goal, acceptance criteria, status,
        │   └── 002-api.md     #   owned paths, progress journal
        └── artifacts/         # any other outputs (docs, diagrams)
```

**transcript.jsonl** — one JSON event per line:

```json
{"ts":"...","type":"turn","seat":"critic","model":"codex/gpt-5","content":"..."}
{"ts":"...","type":"human","content":"focus on the EU market first"}
{"ts":"...","type":"seat_change","seat":"critic","from":"codex/gpt-5","to":"gemini-api/gemini-2.5-pro","reason":"usage_limit"}
{"ts":"...","type":"stage","from":"brainstorm","to":"plan"}
```

Append-only JSONL means: crash-safe, resumable, diff-able, and any model can be given the tail of it as context to pick up a seat mid-session.

**Task file (tasks/001-schema.md)** — YAML frontmatter + journal:

```markdown
---
id: 001
title: Design database schema
status: in_progress          # todo | in_progress | review | done | blocked
owner_seat: builder-1
owned_paths: ["db/", "migrations/"]   # lease: no other seat writes here
acceptance:
  - migrations run cleanly
  - covers entities listed in spec §2
---
## Journal
- [claude-max] Created initial schema, users + orders tables. Next: indexes.
- [codex] Picked up after limit. Added indexes. Gotcha: SQLite lacks X, used Y.
```

## 5. Adapter interface

One interface, three implementations (CLI agent, API model, local model):

```typescript
interface ModelAdapter {
  id: string;                          // "claude-max", "gemini-api", "ollama/llama3"
  auth(): Promise<AuthStatus>;         // verify login/API key works
  capabilities(): Capabilities;        // { canExecute: bool, contextWindow, costTier }
  takeTurn(ctx: TurnContext): Promise<TurnResult>;
  // TurnResult.status: "ok" | "usage_limit" | "error"
  probeQuota?(): Promise<QuotaHint>;   // optional; most providers won't support it
}
```

- **Agent adapters** (Claude Code, Codex) use the official embedding SDKs — `@anthropic-ai/claude-agent-sdk` and `@openai/codex-sdk` — as the primary implementation, with headless-CLI subprocess drivers (`claude -p`, `codex exec --json`) as fallback (see §12). Auth = the user's existing subscription login (`claude login`, `codex login`) — we never touch their credentials, we just use the already-authenticated CLI. These are the seats with **usage windows**, where failover matters most.
- **HTTP adapter** is a single **generic OpenAI-compatible client** (`base_url` + model + key) that covers raw providers *and* gateways — OpenRouter (large free + paid catalog), a local OmniRoute/LiteLLM instance, or any `/v1`-speaking endpoint. Auth = API key from env var or OS keychain, never plaintext config. Pointing a seat at a gateway transparently inherits that gateway's own provider fallback beneath Quorum's seat-level failover.
- **Local adapter** (Ollama) = the never-offline last-resort fallback.

**Limit detection** is pragmatic, not elegant: adapters pattern-match rate-limit / window-reset errors in CLI output and HTTP 429s, and report `usage_limit`. The seat manager then walks that seat's failover chain. Optional `probeQuota` lets adapters that *can* see remaining quota trigger *proactive* handoff (finish current turn, hand off cleanly) instead of reactive.

**config.yaml (seats + failover):**

```yaml
seats:
  proposer:
    chain: [claude-max, openrouter/anthropic/claude-opus, ollama/llama3]
  critic:
    chain: [codex, openrouter/deepseek/deepseek-chat:free, ollama/llama3]
  arbiter:
    chain: [openrouter/google/gemini-2.5-pro, ollama/llama3]
# Gateway seats use base_url + model. OpenRouter free models (":free" suffix)
# make running Quorum cost nothing; swap in a local OmniRoute base_url to reuse
# its 200+ providers and fallback under Quorum's own chain.
providers:
  openrouter: { base_url: "https://openrouter.ai/api/v1", key_env: OPENROUTER_API_KEY }
  omniroute:  { base_url: "http://localhost:20128/v1",    key_env: OMNIROUTE_API_KEY }
budgets:
  max_turns_per_stage: 12
  max_cost_usd: 5.00        # API seats only
  wall_clock_max: 2h
```

## 6. Roundtable protocol (the part that makes or breaks this)

The riskiest assumption in the whole project is that a multi-model debate **converges** instead of politely agreeing ("Great point!") or looping forever. So the protocol is opinionated:

- **Roles, not free-for-all.** Default seats: **Proposer** (advances a concrete approach), **Critic** (must find weaknesses — prompted to disagree and to say "I agree, ship it" only when they genuinely cannot find fault). Optional third seat: **Synthesizer/Arbiter** for 3-model setups. Roles rotate between stages so no model is permanently "the negative one."
- **Structured turns.** The scheduler enforces turn-taking (no simultaneous talking). Each turn has a required shape: *react to what changed → state position → concrete next step or objection.*
- **Convergence is explicit.** Each stage has a budget (e.g. max 12 turns). At any point a seat can call `PROPOSE_CONVERGE` with a draft artifact; the other seats must then either approve or raise a *blocking* objection (with reason). Budget exhausted without convergence → the session pauses and asks the human to arbitrate. The human can also force-converge anytime.
- **Human injection.** Messages from the dashboard/CLI enter a queue and are spliced into the transcript at the next turn boundary — every seat sees them, work never pauses. Human messages carry highest priority: seats must address them in their next turn.
- **Anti-sycophancy measures** (to be tuned empirically): critic role prompts forbid unqualified agreement before turn N; agreement must restate *what specifically* convinced them; identical-position detection ends debate early (that's genuine convergence, which is fine — the goal is convergence, just not *fake* convergence).

## 7. Safety rails

- **Kill switch:** big red STOP in dashboard, `Ctrl+C` / `quorum stop` in CLI. Supervisor owns all child processes; kill tears everything down, always. State is on disk, so a killed session is resumable.
- **Pause/resume:** softer than kill — finish current turn, then hold.
- **Budgets:** max turns, max API cost, max wall-clock per session (config.yaml). Runaway debates can't burn quota or money unattended.
- **Workshop guardrails (phase 2):** file leases (`owned_paths`), isolated git worktrees, no pushes/deploys without human approval.

## 8. Roadmap

| Phase | Ships | You get |
|-------|-------|---------|
| **1 — Roundtable** | Daemon + dashboard + CLI/API/Ollama adapters + brainstorm/plan stages + failover + injection + kill switch | Replaces the copy-paste-between-models workflow entirely. A complete, releasable tool. |
| **2 — Workshop (serial)** | Task ledger execution: *one* executor works the task list, roundtable reviews at checkpoints, full handoff mid-task | End-to-end: goal → spec → built result, surviving usage limits. |
| **3 — Parallel + VS Code** | Multiple executors on disjoint tasks (worktrees + leases); VS Code extension wrapping the dashboard webview | True simultaneous work; editor-native experience. |

Phase 1 is the validation gate: if the roundtable doesn't produce visibly better plans than a single model, we tune the protocol before building anything else.

## 9. Decisions (settled 2026-07-06)

1. **Turn context:** configurable (`context_mode: full | summary_tail`), **default = rolling summary + last N turns**. The summary is maintained continuously in the session directory (`summary.md`) so it doubles as living documentation of the session and as the handoff briefing for any model taking over a seat.
2. **Stage advancement:** configurable (`stage_mode: fixed | models_decide`), **default = models decide, human confirms**. A seat calls `PROPOSE_STAGE_ADVANCE`; the dashboard surfaces a confirm prompt; work continues on the current stage until confirmed (non-blocking).
3. **Seats:** **default 3 — proposer, critic, arbiter.** The arbiter breaks ties and calls convergence, so sessions can finish without human arbitration. 2-seat mode remains available for cheap sessions.
4. **Codex/Claude headless spike:** research findings recorded in §12. Note: Codex typically has more generous usage windows than Claude Max, which makes it a strong second-in-chain rather than an equal-drain peer — the scheduler may deliberately prefer the seat with more remaining headroom for long grinding stages.
5. **License: MIT.**

## 10. Native agent features & the command layer

Users of Claude Code and Codex are used to their agents' native powers — slash commands, custom prompts, project instruction files, MCP tools. Our tool must not feel like a downgrade. Two layers:

**a) Session commands (ours).** The dashboard input box and CLI accept slash commands that control the session itself, working identically regardless of which models are seated:

```
/goal            show or edit the session goal
/status          seats, models, stage, budgets, quota hints
/stage next      force stage advance          /converge   force convergence
/pause  /resume  /stop                        /seat critic use gemini-api
/inject <msg>    (default when no slash)      /summary    show rolling summary
```

**b) Native feature pass-through (theirs).** Where the underlying agents expose features headlessly, adapters map them through a common capability interface:

| Capability | Claude Code | Codex | Exposed as |
|---|---|---|---|
| Project instructions | CLAUDE.md | AGENTS.md | Session writes a shared brief; adapter symlinks/injects it in each agent's native format |
| Custom commands/prompts | slash commands / skills | ~/.codex/prompts | `/agent <seat> /<command> …` passes through if the adapter reports support |
| MCP tools | --mcp-config | MCP config | Per-seat MCP config in config.yaml |
| Status/quota | (adapter-detected) | /status-style info | Feeds `/status` and proactive handoff |

Rule: the common capability interface covers what **both** main agents support (per the decision: feature parity across at least Claude Code + Codex); anything agent-specific stays reachable via explicit `/agent <seat> …` pass-through rather than being hidden. Exact mappings depend on what each CLI supports headlessly — see §12.

## 11. Name — **Quorum** (decided 2026-07-06)

| Name | Why | Risk |
|------|-----|------|
| **Quorum** | Multiple minds reaching agreement; "quorum" also = minimum members needed to proceed, which is literally the failover story | Common word, check npm/repo collisions |
| **Relay** | The handoff story in one word | Very common word |
| **Roundtable** | Says exactly what phase 1 is | Less unique |
| **Tandem** | Two experts working as one | Undersells N>2 models |

Working favorite: **Quorum** — it captures both halves of the pitch (collaboration *and* continuity) in one word.

## 11b. Prior art & positioning

**Quorum sits at the *workflow* layer, not the *routing* layer.** The closest neighbor is [OmniRoute](https://github.com/diegosouzapw/OmniRoute) — a local AI gateway that unifies 200+ providers behind one OpenAI-compatible endpoint with auto-fallback combo chains and quota-sharing. It is excellent at the layer *below* Quorum: "which provider answers this request, and what if it's rate-limited." It has **no deliberation** (its "Fusion" fans one prompt to N models and a judge picks a winner — one-shot, no turns/roles/convergence), **no human-in-the-loop injection**, and **no shared-task process** (stages, task ledger).

The two layers compose rather than compete:

| Layer | Concern | Owner |
|---|---|---|
| **Routing** | which model answers a request; fallback when rate-limited; provider unification | a gateway (OmniRoute, OpenRouter, LiteLLM) — or Quorum's own seat chains |
| **Workflow** | which models are debating what, in which role, at which stage, with the human able to interject | **Quorum** |

**Design consequence:** Quorum's HTTP adapter is a **generic OpenAI-compatible client** (`base_url` + key), so any gateway or provider drops in identically — OpenRouter (huge free + paid model catalog), OmniRoute (a user's local gateway → all its providers + mature fallback for free), LiteLLM, or a raw provider. Native SDK adapters (Claude, Codex) remain first-class for what a plain gateway can't offer: subscription-login reuse and headless slash-command/skill pass-through.

**Positioning one-liner discipline:** continuity is *table stakes* (gateways have it too). Quorum's unique claim is **collaboration with a human referee** — "many models deliberate, and you're at the table" — not "route to many models."

## 12. Headless-driving research findings (2026-07-06)

### 12.1 Codex — verified

The design holds; Codex is fully drivable headlessly, and there's an even better route than raw CLI:

- **Headless run:** `codex exec --json -C <dir> -s <sandbox> -a never [-m model]` — JSONL events on stdout (`thread.started`, `turn.started/completed/failed`, `item.*`, `error`). `turn.completed` includes per-turn token usage → feeds our budget tracking for free.
- **Resume is first-class:** capture `thread_id` from the `thread.started` event; continue with `codex exec resume <id> "<next prompt>"`. Transcript/approvals persist. (No headless fork yet — open request openai/codex#11750.)
- **Auth:** ChatGPT subscription login (`codex login`) works for `exec` — credentials shared via `~/.codex`. API-key mode (`CODEX_API_KEY`) also available. Matches our "reuse existing login" principle.
- **Limit detection:** usage-limit failures surface as error text — "You've hit your usage limit… (every 5h and every week)" — with no dedicated exit code, so the adapter pattern-matches message text on `turn.failed`/`error` events (as designed, §5).
- **Proactive quota (better than hoped):** `codex app-server` (JSON-RPC over stdio) exposes **`account/rateLimits/read`** returning session/weekly bucket status → our `probeQuota()` is implementable for Codex, enabling *proactive* handoff, not just reactive.
- **SDK alternative:** official `@openai/codex-sdk` (TypeScript): `startThread()` / `resumeThread(id)` / `thread.run(prompt)` — wraps the same engine via app-server. **Decision: use the SDK as the primary Codex adapter**, falling back to `codex exec --json` subprocess parsing if the SDK lags the CLI.
- **Native features headlessly:** AGENTS.md is read automatically (✓ our shared-brief plan works); MCP servers configured via `codex mcp add`/config.toml apply to exec runs (✓ per-seat MCP works); `/model`/`/permissions` map to flags. Custom prompts (`~/.codex/prompts`) are interactive-only and deprecated in favor of skills → our pass-through for Codex means *templating the prompt text ourselves*, not invoking `/prompts:name`. No headless `/status` or `/compact` (use app-server rateLimits and rely on auto-compaction).

### 12.2 Claude Code — verified

- **Headless run:** `claude -p "<prompt>" --output-format stream-json` — structured events, final result includes `session_id` and cost metadata. Resume with `--resume <session_id>` / `--continue`. Tool control via `--allowedTools`, `--permission-mode`.
- **Auth:** Pro/Max subscription login **works in `-p` mode** (credential precedence: env API keys > OAuth token > subscription login; avoid `--bare`, which skips subscription credentials and CLAUDE.md).
- **Limit detection:** error text is "5-hour limit reached ∙ resets <time>"; no documented exit code or JSON error schema for quota-exceeded → adapter pattern-matches text (same approach as Codex). **No programmatic quota query exists** — unlike Codex, Claude has no app-server equivalent, so `probeQuota()` is unavailable; Claude seats hand off *reactively*.
- **Native features headlessly:** CLAUDE.md loads automatically (✓ shared brief); **custom slash commands and skills work in `-p` by embedding `/skill-name` in the prompt string** (✓ direct pass-through — better than Codex); MCP via `--mcp-config` (explicit, not auto-loaded). Hooks/subagent config at launch: verified in SDK, unverified for raw CLI.
- **SDK:** `@anthropic-ai/claude-agent-sdk` (TypeScript) — bundles the Claude Code binary, in-process `query()` with streaming input (async iterable prompts), session resume, `canUseTool` callbacks, hooks. **Decision: use the Agent SDK as the primary Claude adapter**, CLI subprocess as fallback.

### 12.3 Combined implications — design confirmed, three refinements

1. **Both primary adapters become SDK-based** (`@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk`), with CLI-subprocess fallbacks. In-process streaming beats stdout parsing; §3's adapter boxes stay the same shape, just thicker. TypeScript stack choice re-confirmed.
2. **Asymmetric quota awareness:** Codex handoff can be *proactive* (app-server `account/rateLimits/read`); Claude handoff is *reactive* (pattern-match limit text). Combined with Codex's generally longer windows, the default scheduling policy writes itself: **Claude leads while healthy, Codex is the endurance seat, and the scheduler front-loads Claude-heavy work early in the 5-hour window.**
3. **Pass-through asymmetry (§10):** Claude Code supports invoking user-defined slash commands/skills headlessly by embedding them in the prompt; Codex custom prompts are interactive-only/deprecated, so its "pass-through" is us templating prompt text. The `/agent <seat> /<command>` feature is therefore native for Claude seats and emulated for Codex seats — same UX either way.

Remaining unverified items (acceptable risk, resolve during build): exact exit codes / JSON error schemas on quota-exceeded for both CLIs; hook & subagent config in raw Claude CLI `-p`; Codex SDK streaming signatures.

## 13. Phase 2 — The Workshop (execution design)

*Status: agreed 2026-07-09 (worktree isolation, serial task-then-review). Phase 1 shipped + smoke-tested; this is the next chapter. Task ledger: `tasks/2xx-*.md`.*

Phase 1 gets models to agree on a plan (`spec.md` + `tasks/`). The **Workshop** executes that ledger: models stop talking and start *doing* — editing files, running commands — with the same "no agent ever owns the task" and human-in-the-loop principles.

### 13.1 Execution loop (serial: one task, then review)

For each runtime task in the session's `tasks/` dir whose `deps` are `done`, lowest id first:

```
1. ASSIGN   pick an executor seat (a model with file/exec tools: claude, codex)
2. ISOLATE  create a git worktree + branch for this task (isolation choice: worktree-per-agent)
3. EXECUTE  the executor works ONLY within the task's owned_paths, in its worktree
4. VERIFY   run the task's acceptance commands; capture pass/fail + output
5. REVIEW   a roundtable REVIEW stage critiques the diff (proposer defends, critic hunts bugs,
            arbiter decides merge/iterate/block)
6. RESOLVE  approved → merge the branch, mark task done; else iterate (back to 3) or block
```

The human can inject at any turn (same mechanism as Phase 1), and STOP tears everything down including any running executor process and its worktree.

### 13.2 New components (layered on Phase 1, not replacing it)

- **Workspace manager** (`@quorum/core`): git worktree lifecycle — `createWorktree(task)`, `listWorktrees()`, `mergeWorktree(task)`, `removeWorktree(task)`. Requires the target project be a git repo (offer `git init` if not). Worktrees live under `.quorum/worktrees/<task-id>/`; auto-removed when merged or on cleanup.
- **Executor capability** (`@quorum/adapters`): today's Claude/Codex adapters run with tools **disabled** (deliberation only). Phase 2 adds an *execute mode*: tools enabled, `sandboxMode: workspace-write`, `workingDirectory` = the task's worktree. `ModelAdapter.capabilities().canExecute` gates which seats can be executors. (Ollama/small HTTP models stay deliberation-only.)
- **Acceptance runner** (`@quorum/core`): runs a task's `acceptance` commands as child processes in the worktree, captures exit code + stdout/stderr, returns a structured pass/fail. This is the objective gate before review.
- **Execute stage** (engine): a new `Stage` handler that drives the loop above, emitting new transcript events (`task_start`, `task_result`, `merge`) so the dashboard/CLI show execution progress live.

### 13.3 Contracts & safety

- **Never touch paths outside `owned_paths`.** The executor's worktree is its sandbox; the merge step refuses changes outside the declared paths (defense in depth).
- **No pushes/deploys without human approval** (DESIGN §7). Merges are local to the user's repo; nothing leaves the machine.
- **Verification is objective first, subjective second:** acceptance commands must pass before the roundtable review even runs. Green tests are necessary, not sufficient — the review can still block.
- **Failover still applies:** if an executor hits its usage limit mid-task, the worktree + task state persist on disk; the next model in the chain resumes the same task in the same worktree. No agent ever owns the task.

### 13.4 Phase 2 task ledger (2xx)

| Task | Scope |
|------|-------|
| 200 | Workspace manager — git worktree lifecycle |
| 210 | Executor adapter mode — tools-enabled execute for claude/codex, `canExecute` capability |
| 220 | Acceptance runner — run task acceptance commands in a worktree, capture result |
| 230 | Execute stage — the assign→isolate→execute→verify→review→resolve loop in the engine |
| 240 | Phase 2 e2e — plan → execute one task → verify → merge, with MockAdapters + a real-repo smoke |

Phase 2 is done when a session can take a goal → converge on a plan → **execute one task end-to-end** (isolated worktree, acceptance passing, reviewed, merged) — surviving a usage-limit handoff mid-task.

# Quorum — Implementation Spec (v1 / Phase 1)

> Companion to [DESIGN.md](DESIGN.md) (the *why/what*). This is the *how*: repo layout, interfaces, contracts, conventions. Any AI agent or human implementing Quorum works from this document plus the task ledger in `tasks/`.

## 1. Stack & conventions

- **Node ≥ 20, TypeScript strict mode, ESM only.** Monorepo via **pnpm workspaces**.
- **Validation:** all file formats and API payloads have **zod** schemas in `@quorum/core`; parse, don't cast.
- **Tests:** vitest. Every task's acceptance criteria include tests. Adapters must pass the shared **adapter contract test suite** (see §5).
- **No hidden state:** anything needed to resume a session must be reconstructible from the session directory alone. If you're tempted to keep it only in memory, write it to disk.
- **Style:** small modules, no classes where a function will do, no external deps without a reason a reviewer would accept. Errors are values where practical (`Result`-style returns in core), thrown only at boundaries.

## 2. Monorepo layout

```
quorum/
├── package.json            # pnpm workspace root, scripts: build/test/lint
├── DESIGN.md  SPEC.md  tasks/  CLAUDE.md  AGENTS.md  LICENSE (MIT)
└── packages/
    ├── core/       # @quorum/core — types+schemas, ledger IO, roundtable engine, scheduler
    ├── adapters/   # @quorum/adapters — ModelAdapter impls + mock + contract tests
    ├── daemon/     # @quorum/daemon — session manager, supervisor, injection queue, HTTP+WS
    ├── dashboard/  # @quorum/dashboard — web UI (Vite + preact), built assets served by daemon
    └── cli/        # quorum — the installable CLI (depends on daemon)
```

Dependency direction (never violated): `core ← adapters ← daemon ← cli`; `dashboard` talks to daemon only over HTTP/WS.

## 3. Core types (`@quorum/core`)

```ts
// ---- transcript events (append-only JSONL; see DESIGN §4) ----
type TranscriptEvent =
  | { ts: string; type: "turn"; seat: SeatId; model: string; content: string;
      move?: "PROPOSE_CONVERGE" | "APPROVE" | "BLOCK" | "PROPOSE_STAGE_ADVANCE";
      usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number } }
  | { ts: string; type: "human"; content: string }
  | { ts: string; type: "seat_change"; seat: SeatId; from: string; to: string;
      reason: "usage_limit" | "error" | "manual" }
  | { ts: string; type: "stage"; from: Stage; to: Stage; by: "models" | "human" }
  | { ts: string; type: "control"; action: "pause" | "resume" | "stop" | "converged";
      by: "human" | "system"; detail?: string };

type Stage = "brainstorm" | "plan" | "execute" | "review";
type SeatId = string;              // e.g. "proposer", "critic", "arbiter"

// ---- session config (.quorum/config.yaml, zod-validated) ----
interface SessionConfig {
  seats: Record<SeatId, { chain: string[]; role: Role; mcp?: unknown }>;
  contextMode: "full" | "summary_tail";     // default summary_tail
  stageMode: "fixed" | "models_decide";     // default models_decide (human confirms)
  budgets: { maxTurnsPerStage: number; maxCostUsd?: number; wallClockMax?: string };
}
type Role = "proposer" | "critic" | "arbiter";
```

## 4. Ledger (`@quorum/core/ledger`)

Owns all disk IO for a session directory (DESIGN §4). Contract:

- `createSession(root, goal, config) → Session` — makes `sessions/<date>-<slug>/`, writes `goal.md`.
- `appendEvent(session, event)` — atomic single-line append to `transcript.jsonl` (write via `fs.appendFile`, one `JSON.stringify` + `\n`; never rewrite the file).
- `readEvents(session, opts?) → TranscriptEvent[]` — tolerant reader: skip+report corrupt lines, never throw on trailing partial line (crash recovery).
- `buildTurnContext(session, seat) → TurnContext` — assembles what a seat sees: `goal.md` + `summary.md` + last N turns (`contextMode: summary_tail`, N default 10) or full transcript (`full`), + pending human injections + role instructions.
- Task files: `readTasks/writeTask` — YAML frontmatter + markdown journal (DESIGN §4 format), frontmatter zod-validated.

## 5. Adapters (`@quorum/adapters`)

```ts
interface ModelAdapter {
  id: string;                                  // "claude", "codex", "ollama/llama3", "anthropic-api"
  auth(): Promise<{ ok: boolean; detail: string }>;
  capabilities(): { passThroughCommands: boolean; contextWindow: number;
                    costTier: "subscription" | "api" | "free" };
  takeTurn(ctx: TurnContext, signal: AbortSignal): Promise<TurnResult>;
  probeQuota?(): Promise<{ remainingPct?: number; resetsAt?: string }>;
}
type TurnResult =
  | { status: "ok"; content: string; move?: Move; usage?: Usage }
  | { status: "usage_limit"; detail: string }     // triggers failover chain
  | { status: "error"; detail: string; retryable: boolean };
```

Implementations (each its own task):
- **mock** — scriptable responses; powers all core/daemon tests. Ships with the **contract test suite** every adapter must pass: auth failure surfaces cleanly; abort signal honored ≤2s; usage_limit detected from fixture; malformed output → `error`, never a crash.
- **ollama** — HTTP to `localhost:11434` (`/api/chat`). No limits; the never-offline fallback.
- **claude** — `@anthropic-ai/claude-agent-sdk`, `query()` with `resume`; session_id persisted in session dir. Limit detection: match `/limit reached|usage limit/i` in errors → `usage_limit`. No `probeQuota` (platform doesn't expose it). Roundtable seats run with tools disabled (deliberation is talk-only in Phase 1).
- **codex** — `@openai/codex-sdk` threads (`startThread`/`resumeThread`); `probeQuota()` via `codex app-server` JSON-RPC `account/rateLimits/read`. Limit detection: match "hit your usage limit".
- **http (generic OpenAI-compatible)** — one client (`base_url` + model + key) serving raw providers *and* gateways. Named providers from config `providers:` map (openrouter, omniroute, litellm, …); model id `"<provider>/<model>"` (e.g. `openrouter/deepseek/deepseek-chat:free`). Direct `anthropic-api`/`openai-api`/`gemini-api` are thin presets over it. Key from env/keychain only. `:free` models cost 0. See DESIGN §11b — this is the workflow-on-top-of-gateway seam; do **not** rebuild the routing layer.

## 6. Roundtable engine (`@quorum/core/roundtable`)

Pure logic, no IO (ledger + adapters injected). The turn loop:

1. Next seat = round-robin (proposer → critic → arbiter), skipping paused seats.
2. Splice any queued human injections into the transcript *before* the turn; they must be addressed in that turn (role prompt says so).
3. `buildTurnContext` → `adapter.takeTurn`. On `usage_limit`/non-retryable `error`: seat manager walks the chain, emits `seat_change`, retries the turn with the next model.
4. Parse `move` from the response (structured: models are instructed to end turns with a fenced `move:` block; parser is forgiving — absent block = plain turn).
5. Moves: `PROPOSE_CONVERGE` (others must APPROVE or BLOCK-with-reason within one round; arbiter breaks ties; converged → write artifact, stage done) · `PROPOSE_STAGE_ADVANCE` (surface human confirm, non-blocking) · budget exhausted → pause + ask human.
6. Anti-sycophancy (role prompts, tune empirically): critic may not APPROVE before turn 3 of a stage; approvals must state *what specifically* convinced them.

Stage artifacts: brainstorm → `artifacts/ideas.md`; plan → `spec.md` + `tasks/`. The **summary maintainer** updates `summary.md` after every K=3 turns using the cheapest seated adapter.

## 7. Daemon (`@quorum/daemon`)

- **Session manager:** create/resume/list sessions; one roundtable loop per session; supervisor owns all child processes — `stop` always tears down (SIGTERM → SIGKILL after 5s).
- **HTTP API (localhost only, random port, printed on start):**
  - `POST /sessions` `{goal, configPath?}` → `{id}` · `GET /sessions` · `GET /sessions/:id`
  - `POST /sessions/:id/inject` `{content}` · `POST /sessions/:id/command` `{command}` (session commands, DESIGN §10a)
  - `POST /sessions/:id/pause|resume|stop`
  - `GET /sessions/:id/events` → **WebSocket**: replays transcript from offset, then live events.
- Security: bind 127.0.0.1; bearer token generated per daemon run, written to `.quorum/daemon.json`, required on every request (dashboard reads it via the serve URL).

## 8. CLI (`quorum`) & dashboard

- CLI: `quorum start "<goal>"` (starts daemon if needed, opens dashboard) · `status` · `inject "<msg>"` · `pause|resume|stop` · `attach` (tail live transcript in terminal). Thin HTTP client over §7.
- Dashboard (Vite + preact, built into daemon's static dir): transcript stream with per-seat colors; input box (plain text = inject, `/…` = command); seat cards (model, chain position, quota hint); stage indicator + confirm prompt for stage advances; STOP (red, always visible) and pause. No auth screens, no settings UI in v1 — config is the YAML file.

## 9. Definition of done (Phase 1 / walking skeleton)

`quorum start "plan a birthday party"` with a config of 3 mock seats (and optionally real Ollama) runs brainstorm → plan, produces `artifacts/ideas.md` + `spec.md`, accepts a mid-run `quorum inject`, survives a simulated `usage_limit` (seat visibly fails over), and dies instantly on STOP — with `pnpm test` green, including adapter contract suites.

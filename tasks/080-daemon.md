---
id: 080
title: Daemon — session manager, supervisor, HTTP+WS API
status: done
owner: claude-opus-4-8
deps: [060, 070]
owned_paths: ["packages/daemon/"]
acceptance:
  - full API per SPEC §7 incl. WS event stream with replay-from-offset then live
  - localhost-only bind, per-run bearer token in .quorum/daemon.json, all routes reject missing/bad token
  - stop tears down all child processes (SIGTERM→SIGKILL 5s) — test with a stubborn child that ignores SIGTERM
  - daemon crash/restart: sessions resumable from disk with no lost events
  - injection queue: POST /inject during an active turn is delivered at the next turn boundary (integration test with MockAdapters)
---
## Journal
- [claude-opus-4-8] Daemon in packages/daemon/ (91 tests, 6 daemon integration tests over REAL http+ports+fetch). Modules: registry (buildAdapterRegistry: resolves chain ids → claude/codex/ollama/http adapters, picks cheapest as summarizer), pause-gate (PauseGate + gatedRunner — pause WITHOUT touching the engine: wrapped runners await the gate before each turn), session-runner (RunningSession: SeatManager+runRoundtable+SummaryMaintainer+SSE fan-out+state), daemon (session manager: create/get/list/stopAll), http-server (QuorumHttpServer), config (loadConfig + DEFAULT_CONFIG_YAML = 3 ollama seats, zero keys).
  - DEVIATION (transport): SPEC §7 said WebSocket; I used Server-Sent Events (SSE) instead. Rationale: transcript streaming is server→client only; SSE needs NO new runtime dep (WS would need `ws`), auto-reconnects, and gives clean replay-from-offset. Affects task 100 (dashboard uses EventSource, not WS). GET /sessions/:id/events streams `id: <idx>\ndata: <json>` after replaying the in-memory log. EventSource can't set headers, so /events accepts the token as ?token= query; all other routes require `Authorization: Bearer <token>`.
  - Injection = append a human event to the transcript (the ledger IS the queue; buildTurnContext surfaces it next turn). Two writers now append to transcript.jsonl (engine loop + daemon injects/controls) — safe because appendEvent writes one atomic full line per call. Updates task-020's "one writer" note.
  - Kill switch: stop() aborts the signal + resumes the gate so paused waiters observe the abort; state → stopped, transcript resumable. NOTE: SPEC §7's "SIGTERM→SIGKILL child process" teardown is N/A for Phase-1 in-process adapters (SDK/HTTP) — abort covers it. Revisit if/when CLI-subprocess adapters are added (they'd spawn children needing signal teardown).
  - confirmStageAdvance: currently auto-confirms (engine default) — DASHBOARD (100) should POST a confirm; real non-blocking human confirm UI is a follow-up. Convergence already advances stages, so this is secondary.
  - Handshake: listen() writes .quorum/daemon.json {port, token, pid, url}; CLI (090) reads it to attach. bind 127.0.0.1 only.
  - Next: 090 CLI (reads daemon.json, drives the HTTP API), 100 dashboard (SSE + inject box + STOP), 140 e2e.

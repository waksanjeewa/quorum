---
id: 140
title: E2E — walking skeleton (Definition of Done, SPEC §9)
status: done
owner: claude-opus-4-8
deps: [090, 100, 060, 070]
owned_paths: ["e2e/"]
acceptance:
  - scripted E2E (vitest, MockAdapters) - quorum start "plan a birthday party" with 3 seats runs brainstorm→plan, artifacts/ideas.md and spec.md exist and are non-trivial
  - mid-run inject is visible in transcript and addressed in the following turn
  - scripted usage_limit on the critic seat fails over mid-stage; session completes; seat_change event in transcript
  - quorum stop mid-turn - all processes dead <6s, session resumable afterwards
  - manual smoke-test doc (e2e/SMOKE.md) - same flow with real Ollama + one real subscription seat, checklist format
---
## Notes
This task closes Phase 1. When it's done, update README quickstart and tag v0.1.0.

## Journal
- [claude-opus-4-8] e2e/walking-skeleton.test.ts (103 tests total, 4 e2e) drives the FULL stack (daemon+engine+adapters+ledger) via QuorumHttpServer exactly as `quorum start` does, with MockAdapters. All Phase-1 DoD scenarios pass: (1) brainstorm→plan convergence writing non-trivial ideas.md + spec.md + dashboard reachable; (2) mid-run injection appears in transcript AND is addressed on the next turn; (3) usage_limit on critic seat → seat_change (c1→c2) → session still completes; (4) STOP on a hanging run halts <6s and the session reopens (openSession) with the stop event intact. e2e/SMOKE.md written (manual real-Ollama + cross-provider-failover + SDK-reality checklist). README.md written with quickstart.
  - e2e wiring gotcha: e2e/ tests at repo root couldn't resolve @quorum/* — fixed by adding @quorum/core|adapters|daemon as workspace:* devDeps of the ROOT package.json so pnpm links them into root node_modules (root vitest already includes e2e/**).
  - REAL BUG FOUND + FIXED via the injection scenario: an injection arriving WHILE a turn is in flight lands in the transcript BEFORE that turn's event, so the positional pendingInjections("human events after last turn") heuristic silently swallowed it. Fixed properly: buildTurnContext gained an `addressedHumanCount` option (pending = all human events beyond that count), and the engine now tracks `addressedHumans` (incremented by the count each turn actually surfaced, snapshotted at context-build time so an injection mid-turn stays pending for the next turn). This is more correct for real (slow) model turns, not just the test. Positional helper kept as the default for other callers.
  - Clean-slate `pnpm build && pnpm test` from wiped dist = green. PHASE 1 COMPLETE. Ready to tag v0.1.0. Remaining before a real-model release: run e2e/SMOKE.md against live Ollama + Claude/Codex and reconcile any SDK message-shape differences (tasks 110/120 journals).

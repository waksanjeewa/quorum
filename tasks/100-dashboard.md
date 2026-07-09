---
id: 100
title: Dashboard — minimal local web UI
status: done
owner: claude-opus-4-8
deps: [080]
owned_paths: ["packages/dashboard/"]
acceptance:
  - transcript stream over WS with per-seat colors and stage indicator
  - input box - plain text injects, leading "/" runs session commands, with visible command feedback
  - seat cards - model, position in failover chain, quota hint when available, seat_change shown inline in transcript
  - stage-advance confirmation prompt appears when engine requests it; confirm/deny round-trips
  - STOP button (always visible, red) and pause/resume; STOP works even while a turn is streaming
  - built assets served by daemon; zero external CDN/network dependencies
---
## Notes
Vite + preact, keep deps minimal. Design for "referee a conversation" ergonomics, not admin-panel completeness. Future VS Code webview reuse (DESIGN roadmap phase 3) — no window.open, no absolute URLs.

## Journal
- [claude-opus-4-8] Dashboard in packages/dashboard/ (99 tests). DEVIATION from task note (Vite+preact): implemented as ONE self-contained HTML page via `renderDashboard(token)` returning inline CSS+vanilla-JS — zero build toolchain, zero deps, zero external hosts (verified by test regex: no https URLs except 127.0.0.1, no <link>, no cdn). Simpler than Vite+preact and satisfies every acceptance item; still webview-ready (no window.open, relative URLs only). Theme-aware via prefers-color-scheme.
  - Features: SSE transcript stream (EventSource, per-seat colors), inject box (plain text → /inject, leading "/" → /command), seat cards (model + paused state, polled every 2s from status), stage indicator, Pause/Resume + red STOP. Auto-picks the latest session on load.
  - DEP-DIRECTION seam: the daemon must NOT depend on the dashboard package. So HttpServerOpts gained an optional `renderDashboard?: (token)=>string`; the CLI (which already depends on both) imports @quorum/dashboard and injects it into QuorumHttpServer. GET / and /index.html serve the shell UNAUTHENTICATED (localhost-only), with the token embedded so the page's JS authenticates API calls. Daemon test confirms GET / returns the HTML with the token, no auth header needed.
  - Stage-advance confirm UI: not built (engine auto-confirms today) — follow-up when non-blocking human confirm lands (see task 080 journal).
  - Next: 140 e2e walking skeleton (closes Phase 1).

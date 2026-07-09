---
id: 100
title: Dashboard — minimal local web UI
status: todo
owner: null
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
- (empty)

---
id: 080
title: Daemon — session manager, supervisor, HTTP+WS API
status: todo
owner: null
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
- (empty)

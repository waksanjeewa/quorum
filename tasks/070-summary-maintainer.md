---
id: 070
title: Rolling summary maintainer
status: done
owner: claude-opus-4-8
deps: [050]
owned_paths: ["packages/core/src/summary/"]
acceptance:
  - after every K turns (config, default 3), cheapest-tier seated adapter updates summary.md (structured: decisions so far / open threads / current focus)
  - summary update runs off the critical path (does not delay the next turn)
  - buildTurnContext picks up the newest summary; a model given ONLY goal+summary+last-3-turns can answer "what stage are we in and what was decided" in a scripted test
---
## Journal
- [claude-opus-4-8] SummaryMaintainer in packages/core/src/summary/ (46 tests, 2 new). Every K turns (default 3, configurable) it asks an injected `summarizer` SeatRunner (the daemon passes the cheapest-costTier seated adapter) to rewrite summary.md under fixed headings (Decisions so far / Open threads / Current focus, stage stated explicitly). Uses a summarization TurnContext (full transcript, dedicated instructions). `running` guard prevents overlapping passes.
  - "Off the critical path" is a CALLER contract: maybeUpdate() is async; the DAEMON (080) must call it fire-and-forget (no await) after appending turns so it never delays the next turn. Documented on the class.
  - Verified the takeover story: after a summary write, buildTurnContext(summary_tail, tailSize 3) yields a ctx whose summary alone conveys stage + decisions — a fresh model can recover context from goal+summary+last-3-turns.
  - Next: 080 daemon (wires SeatManager + runRoundtable + SummaryMaintainer + injection queue behind an HTTP+WS API).

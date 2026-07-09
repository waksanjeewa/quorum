---
id: 070
title: Rolling summary maintainer
status: todo
owner: null
deps: [050]
owned_paths: ["packages/core/src/summary/"]
acceptance:
  - after every K turns (config, default 3), cheapest-tier seated adapter updates summary.md (structured: decisions so far / open threads / current focus)
  - summary update runs off the critical path (does not delay the next turn)
  - buildTurnContext picks up the newest summary; a model given ONLY goal+summary+last-3-turns can answer "what stage are we in and what was decided" in a scripted test
---
## Journal
- (empty)

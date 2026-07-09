---
id: 140
title: E2E — walking skeleton (Definition of Done, SPEC §9)
status: todo
owner: null
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
- (empty)

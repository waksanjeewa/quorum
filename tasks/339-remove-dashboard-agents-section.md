---
id: 339
title: Remove standalone dashboard agents section
status: done
owner: codex-gpt-5
deps: [338]
owned_paths:
  - "packages/dashboard/src/index.ts"
  - "packages/dashboard/src/dashboard.test.ts"
  - "tasks/339-remove-dashboard-agents-section.md"
acceptance:
  - dashboard left rail no longer shows a separate Agents heading or role cards
  - agent/model status remains visible in the Activity card chips
  - dashboard render tests cover the absence of the standalone Agents section
  - pnpm build and pnpm test pass
---
## Notes
User reviewed the dashboard screenshot and preferred the agent/model information under Activity. The standalone Agents section with Proposer/Critic/Arbiter cards is visually redundant.

## Journal
- [codex-gpt-5] Started a focused dashboard cleanup. Scope is limited to removing the separate Agents section and its rendering/tests while preserving Activity chips.
- [codex-gpt-5] Removed the standalone Agents heading and role-card section from the dashboard left rail, removed the unused `seatsEl` render path and dead `.seat` CSS, and updated dashboard tests to assert the separate section stays absent while Activity retains `activitySeat` agent/model chips. Validation: `pnpm build` passed and `pnpm test` passed (188 tests).

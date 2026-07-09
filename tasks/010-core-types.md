---
id: 010
title: Core types and zod schemas
status: todo
owner: null
deps: [000]
owned_paths: ["packages/core/src/types/"]
acceptance:
  - TranscriptEvent, Stage, SeatId, SessionConfig, Role, TurnResult, Move types exactly per SPEC §3/§5
  - zod schema for every type; parse helpers reject malformed samples (tests with fixtures)
  - config.yaml example from DESIGN §5 parses successfully in a test
---
## Notes
These types are the contract every other package imports. Get them right first; changing them later ripples everywhere.

## Journal
- (empty)

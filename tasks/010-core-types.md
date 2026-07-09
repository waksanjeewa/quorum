---
id: 010
title: Core types and zod schemas
status: done
owner: claude-opus-4-8
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
- [claude-opus-4-8] Wrote all core types in packages/core/src/types/ (primitives, transcript, turn, config) as zod schemas with inferred TS types; barrel in types/index.ts, re-exported from core index. 12 tests green, incl. parsing the DESIGN §5 config YAML through the `yaml` package.
  - Deviations from SPEC §3 (journaled per workflow): (1) Added `providers: Record<string,{baseUrl,keyEnv}>` to SessionConfig — not in SPEC §3 but present in the DESIGN §5 example and required by task 130 (generic OpenAI-compat adapter). (2) `usage_limit` TurnResult carries optional `resetsAt` (ISO) — SPEC §5 showed only `detail`, but DESIGN §12/task 060 need reset time for proactive re-enable; additive, safe. (3) Config parsing accepts snake_case YAML (human-facing, per DESIGN §5) and transforms to camelCase internal types (SPEC §3) — the two docs disagreed on casing; resolved in favor of both. (4) Seat `role` defaults to the seat key when the key is a valid Role (proposer/critic/arbiter), matching the DESIGN §5 example where seat names ARE roles.
  - Chose zod `discriminatedUnion` on `type`/`status` for TranscriptEvent/TurnResult → gives adapters/engine exhaustive narrowing. `TranscriptEventOf<T>` helper for that. Timestamps validated as ISO datetime with offset.
  - Next: task 020 (ledger) — will consume TranscriptEventSchema for JSONL read/write and SessionConfigSchema for config load.

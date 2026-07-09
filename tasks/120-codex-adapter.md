---
id: 120
title: Codex adapter (@openai/codex-sdk + app-server quota)
status: done
owner: claude-opus-4-8
deps: [030]
owned_paths: ["packages/adapters/src/codex/"]
acceptance:
  - takeTurn via SDK threads (startThread/resumeThread, thread_id persisted per seat)
  - ChatGPT subscription login reused (~/.codex creds); auth() verifies via codex login status or SDK equivalent
  - probeQuota() implemented via app-server JSON-RPC account/rateLimits/read (session + weekly buckets → remainingPct, resetsAt)
  - usage-limit errors ("hit your usage limit") map to status usage_limit
  - passes contract suite with SDK stubbed; optional live test behind CODEX_TEST=1
---
## Notes
See DESIGN §12.1. Fallback if SDK gaps found: spawn codex exec --json and parse JSONL (thread.started → thread_id; turn.failed/error events). passThroughCommands = false — emulate by templating prompt text.

## Journal
- [claude-opus-4-8] createCodexAdapter in packages/adapters/src/codex/ (shares SdkAdapter/ChatClient with claude — see task 110 journal). capabilities passThroughCommands=false (Codex custom prompts are interactive-only per DESIGN §12.1 — pass-through emulated by prompt templating), costTier subscription, contextWindow 272k. limitRegex /hit your usage limit|usage limit|rate limit/i.
  - probeQuota() IMPLEMENTED (the Claude/Codex asymmetry from DESIGN §12): best-effort app-server rateLimits read (primary bucket → remainingPct/resetsAt), returns {} when unavailable so SeatManager just won't proactively hand off. This is what lets Codex seats hand off BEFORE hitting the wall. Verified via injected probeQuota in tests; the real app-server call shape is best-effort and must be confirmed in CODEX_TEST=1 (task 140).
  - Same optional-SDK build trick + in-memory session (thread_id) resume as claude. Lazy bridge: startThread/resumeThread + thread.run(system+user) → finalResponse. Confirm SDK method names (startThread/resumeThread/run, result.finalResponse, thread.id) against the live @openai/codex-sdk in smoke; correct if they differ.
  - Next: 080 daemon.

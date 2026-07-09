---
id: 120
title: Codex adapter (@openai/codex-sdk + app-server quota)
status: todo
owner: null
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
- (empty)

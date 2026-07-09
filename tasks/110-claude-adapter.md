---
id: 110
title: Claude adapter (@anthropic-ai/claude-agent-sdk)
status: todo
owner: null
deps: [030]
owned_paths: ["packages/adapters/src/claude/"]
acceptance:
  - takeTurn via SDK query() with session resume (session_id persisted in session dir per seat)
  - subscription login reused (no API key required when user is logged into Claude Code); auth() reports which credential source is active
  - usage-limit errors (match /limit reached|usage limit/i) map to status usage_limit with resetsAt parsed from message when present
  - tools disabled for roundtable turns (deliberation only in Phase 1)
  - passes contract suite with SDK stubbed; optional live test behind CLAUDE_TEST=1
---
## Notes
See DESIGN §12.2. Avoid --bare semantics (skips subscription creds + CLAUDE.md). Pass-through: capabilities().passThroughCommands = true — embed /command strings in prompt.

## Journal
- (empty)

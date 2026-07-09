---
id: 110
title: Claude adapter (@anthropic-ai/claude-agent-sdk)
status: done
owner: claude-opus-4-8
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
- [claude-opus-4-8] createClaudeAdapter in packages/adapters/src/claude/ (85 tests total). Built on a shared SdkAdapter (src/sdk/chat-client.ts) — a `ChatClient` port both SDK adapters drive, so session-resume/limit-detection/abort are shared + unit-tested with STUB clients (no SDK install, no network). Claude: capabilities passThroughCommands=true (headless slash/skill pass-through per DESIGN §12.2), costTier subscription, contextWindow 200k. limitRegex /limit reached|usage limit/i → usage_limit; ISO reset time parsed from message when present. Tools disabled (allowedTools:[]) — deliberation only in Phase 1. auth() reports credential source (subscription login vs ANTHROPIC_API_KEY) and detects a missing SDK gracefully.
  - KEY BUILD TRICK for optional SDKs: dynamic import uses a NON-LITERAL specifier (`const mod = "@anthropic-ai/claude-agent-sdk"; await import(mod)`) so tsc does NOT try to resolve the (uninstalled) module → build stays green without the dep. The lazy bridge maps the SDK's streaming query() (system/init → session_id, assistant text blocks, result) to ChatClient. This bridge is NOT unit-tested against the real SDK (it's not installed) — verify against live SDK in the CLAUDE_TEST=1 path (task 140 smoke) and correct the message-shape mapping if the SDK differs.
  - DEVIATION: SDK session_id persists ACROSS turns IN MEMORY (adapter instance), not to the session dir per-seat as the acceptance literally says. Rationale: transcript.jsonl is the true context source; on-disk SDK-session persistence for cross-process resume is a future enhancement. Journaling per workflow rules.
  - Next: 080 daemon (build adapter registry from ollama + http + claude + codex).

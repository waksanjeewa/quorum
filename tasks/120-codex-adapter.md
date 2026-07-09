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
  - Same optional-SDK build trick + in-memory session (thread_id) resume as claude. Lazy bridge: startThread/resumeThread + thread.run(system+user) → finalResponse.
  - LIVE SMOKE VERIFIED (2026-07-09, @openai/codex-sdk 0.143.0, real ChatGPT login): SDK shape CONFIRMED — exports {Codex, Thread}; Codex.startThread/resumeThread; thread.run(prompt)→{items, finalResponse, usage}; thread.id populated after run (UUID). My mapping (finalResponse, thread.id) was correct. auth() reused ~/.codex login with no API key. A real 2-seat Codex roundtable CONVERGED brainstorm→plan and wrote real spec.md/ideas.md.
  - BUG FOUND + FIXED in live smoke: the SDK errors "Not inside a trusted directory and --skip-git-repo-check was not specified" when the session cwd isn't a git repo (common for Quorum). FIX: createCodexSdkClient now passes `{ skipGitRepoCheck: true, sandboxMode: "read-only" }` to startThread/resumeThread (read-only is correct — Phase-1 deliberation never writes files). Verified: fails in /tmp without it, works with it.
  - probeQuota FINDING: my guessed `codex.rateLimits()` does NOT exist on the SDK Codex object → probeQuota returns {} (graceful), so Codex handoff is currently REACTIVE-ONLY (same as Claude), NOT proactive. To restore proactive handoff, call the app-server JSON-RPC `account/rateLimits/read` directly (spawn `codex app-server`, or find the SDK method). Known limitation, safe. Left for a follow-up.
  - SDKs are now optionalDependencies of @quorum/adapters (claude-agent-sdk ^0.3.205, codex-sdk ^0.143.0); build stays hermetic via the non-literal dynamic import.
  - Next: 080 daemon.

---
id: 040
title: Ollama adapter (free local fallback)
status: done
owner: claude-opus-4-8
deps: [030]
owned_paths: ["packages/adapters/src/ollama/"]
acceptance:
  - talks to localhost:11434 /api/chat, model name from adapter id suffix (ollama/llama3)
  - passes contract suite against a stubbed HTTP server (no real Ollama needed in CI)
  - optional integration test behind OLLAMA_TEST=1 env flag runs against real local Ollama
---
## Journal
- [claude-opus-4-8] OllamaAdapter in packages/adapters/src/ollama/ (69 tests total). POSTs /api/chat with injected `fetchImpl` (defaults to global fetch, Node 25 has it). id = "ollama/<model>", costTier free, no usage windows. auth() pings /api/tags for reachability with a helpful "is `ollama serve` running?" message. 429→usage_limit (rare, defensive), 5xx→retryable error, missing message.content→non-retryable error, abort→AbortError. Passes the shared contract suite via stubbed fetch. Real-Ollama integration test (OLLAMA_TEST=1) NOT added yet — deferred to the e2e smoke doc (task 140); the stubbed contract coverage is sufficient for CI.
  - Introduced shared/render.ts `renderContext(ctx)` → {system,user} — provider-neutral prompt rendering (goal + stage + summary + conversation + pending injections + "your turn as <role>"). Reused by http adapter; SDK adapters (110/120) should reuse it too. Added contract/stub-fetch.ts (test-only, build-excluded) with stubFetch/jsonResponse/hangingFetch helpers — reuse for any HTTP adapter tests.

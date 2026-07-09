---
id: 040
title: Ollama adapter (free local fallback)
status: todo
owner: null
deps: [030]
owned_paths: ["packages/adapters/src/ollama/"]
acceptance:
  - talks to localhost:11434 /api/chat, model name from adapter id suffix (ollama/llama3)
  - passes contract suite against a stubbed HTTP server (no real Ollama needed in CI)
  - optional integration test behind OLLAMA_TEST=1 env flag runs against real local Ollama
---
## Journal
- (empty)

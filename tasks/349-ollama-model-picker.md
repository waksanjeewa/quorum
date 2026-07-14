---
id: 349
title: Add Ollama local model picker
status: done
owner: codex-gpt-5
deps: [348]
owned_paths:
  - "packages/cli/src/setup.ts"
  - "packages/cli/src/setup.test.ts"
  - "packages/daemon/src/settings.ts"
  - "packages/daemon/src/settings.test.ts"
  - "packages/daemon/src/http-server.ts"
  - "packages/daemon/src/index.ts"
  - "README.md"
  - "docs/getting-started.md"
  - "CHANGELOG.md"
  - "tasks/349-ollama-model-picker.md"
acceptance:
  - Selecting Ollama in `/models` asks which local Ollama model to use
  - Selecting Ollama in `/frugal` asks which local Ollama model to use
  - The picker lists locally installed Ollama models when `ollama serve` is reachable
  - The picker still allows typing a model name when Ollama is not reachable
  - Dashboard settings catalog includes locally installed Ollama models when reachable
  - build, tests, lint, and public-safety checks pass
---
## Notes
User reported that selecting Ollama does not allow choosing the specific free model inside Ollama. Current setup hardcodes `ollama/llama3`.

## Journal
- [codex-gpt-5] Started task after reading DESIGN.md, SPEC.md, and task ledger. Will replace the hardcoded Ollama model with a real local model picker while preserving the `llama3` fallback for first-time users.
- [codex-gpt-5] Added `fetchOllamaModelNames` over local `/api/tags`, used by both the CLI setup flow and dashboard settings catalog. Dashboard Settings now includes installed Ollama models when `ollama serve` is reachable, with static defaults preserved as fallback.
- [codex-gpt-5] Replaced the hardcoded `ollama/llama3` CLI setup behavior with an Ollama local model picker. `/models` and `/frugal` now list installed local models when available, and still allow typing any model id when Ollama is offline or has no pulled models.
- [codex-gpt-5] Updated README, getting-started docs, and changelog. Validation passed: targeted setup/settings/daemon tests, `corepack pnpm build`, `corepack pnpm test` (197 tests), `corepack pnpm lint`, `git diff --check`, palette scan (only the explicit no-purple checklist mention), and tracked-file public-safety scan.

---
id: 130
title: Generic OpenAI-compatible HTTP adapter (providers + gateways)
status: todo
owner: null
deps: [030]
owned_paths: ["packages/adapters/src/http/"]
acceptance:
  - single OpenAI-compatible chat client (base_url + model + key) — one code path serving raw providers AND gateways
  - named providers resolved from config `providers:` map (base_url + key_env), e.g. openrouter, omniroute, litellm; model id form "<provider>/<model>" (e.g. openrouter/deepseek/deepseek-chat:free)
  - direct providers work too - anthropic-api, openai-api, gemini-api as thin presets over the same client (Gemini via its OpenAI-compat endpoint; if unavailable, a small translation shim — journal which path was used)
  - keys from env vars / OS keychain only; missing key -> auth() { ok:false } with a helpful message naming the env var, never a crash mid-session
  - HTTP 429 -> usage_limit (respect Retry-After / resetsAt when present); 5xx -> error retryable; 4xx auth -> error non-retryable
  - OpenRouter free models (":free") verified reachable in an optional live test behind OPENROUTER_TEST=1; cost estimated as 0 for :free, else from token counts x static price table (feeds budgets.maxCostUsd)
  - passes contract suite against a stubbed OpenAI-compatible HTTP server
---
## Notes
See DESIGN §11b + §5. This adapter is what makes Quorum cheap-to-free (OpenRouter free tier) and lets a user front it with their own OmniRoute/LiteLLM gateway to inherit that gateway's provider fallback beneath Quorum's seat chains. Do NOT rebuild the gateway layer — Quorum is the workflow layer on top. Keep the price table in a separate data file for easy updates.

## Journal
- (empty)

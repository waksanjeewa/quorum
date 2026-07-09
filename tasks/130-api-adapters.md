---
id: 130
title: Generic OpenAI-compatible HTTP adapter (providers + gateways)
status: done
owner: claude-opus-4-8
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
- [claude-opus-4-8] Generic HttpAdapter in packages/adapters/src/http/ (69 tests total). ONE OpenAI-compatible /chat/completions client for raw providers AND gateways. resolveHttpAdapter(id, {providers, env, fetchImpl}) parses "<provider>/<model...>" — provider = first path segment (built-in DIRECT_PROVIDERS: openai-api/anthropic-api/gemini-api, or a config providers: entry like openrouter/omniroute/litellm); model = the REMAINDER (handles nested names like deepseek/deepseek-chat:free). Returns undefined for ollama/* and bare ids so the daemon's registry can fall through to other adapter kinds.
  - Direct-provider path decision: all three use their OpenAI-compat endpoints — anthropic-api → https://api.anthropic.com/v1, gemini-api → https://generativelanguage.googleapis.com/v1beta/openai, openai-api → https://api.openai.com/v1. No translation shim needed (Gemini + Anthropic both expose /chat/completions compat). If a future model needs the native Anthropic Messages API, add a separate adapter; this one stays OpenAI-shaped.
  - Keys: env-only (never config files). Missing key → auth() {ok:false} naming the env var; a turn with no key → {status:error, retryable:false} (no crash). 429→usage_limit (+resetsAt from Retry-After, seconds or HTTP-date); 401/403→non-retryable error; 5xx→retryable; malformed completion→non-retryable error; abort→AbortError. Cost via prices.ts static table (per-MTok, matched by regex; :free → 0) → usage.costUsd feeds budgets.maxCostUsd.
  - This is the cheap-to-free path: OpenRouter :free models cost nothing; a user can also front a local OmniRoute/LiteLLM via a providers: entry and inherit its fallback beneath Quorum's chains. Did NOT rebuild the routing layer (DESIGN §11b).
  - Next: 110 (claude SDK adapter), 120 (codex SDK adapter), then 080 daemon builds the registry from ollama + resolveHttpAdapter + claude/codex.

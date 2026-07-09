import type { ProviderConfig } from "@quorum/core";
import { HttpAdapter } from "./http-adapter.js";

/** Built-in direct providers exposing OpenAI-compatible /chat/completions endpoints. */
export const DIRECT_PROVIDERS: Record<string, { baseUrl: string; keyEnv: string }> = {
  "openai-api": { baseUrl: "https://api.openai.com/v1", keyEnv: "OPENAI_API_KEY" },
  // Anthropic's OpenAI-compatibility endpoint.
  "anthropic-api": { baseUrl: "https://api.anthropic.com/v1", keyEnv: "ANTHROPIC_API_KEY" },
  // Gemini's OpenAI-compatibility endpoint.
  "gemini-api": { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyEnv: "GEMINI_API_KEY" },
};

export interface ResolveHttpOpts {
  /** Named gateways/providers from config (openrouter, omniroute, litellm, …). */
  providers?: Record<string, ProviderConfig>;
  /** Env for key lookup. Defaults to process.env. */
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

/**
 * Resolve a chain id like "openrouter/deepseek/deepseek-chat:free" or "anthropic-api/claude-opus"
 * into an HttpAdapter. Provider = first path segment (built-in direct provider, or a config
 * `providers:` entry); the remainder is the model. Returns undefined for an unknown provider or a
 * non-http id (e.g. "ollama/…", "claude", "codex") so the caller can try another adapter kind.
 */
export function resolveHttpAdapter(id: string, opts: ResolveHttpOpts = {}): HttpAdapter | undefined {
  const slash = id.indexOf("/");
  if (slash < 0) return undefined;
  const provider = id.slice(0, slash);
  const model = id.slice(slash + 1);
  if (provider === "ollama") return undefined;

  const source = DIRECT_PROVIDERS[provider] ?? opts.providers?.[provider];
  if (!source) return undefined;
  const baseUrl = "baseUrl" in source ? source.baseUrl : (source as ProviderConfig).baseUrl;
  const keyEnv = "keyEnv" in source ? source.keyEnv : (source as ProviderConfig).keyEnv;

  const env = opts.env ?? process.env;
  const isFree = /:free$/i.test(model);
  return new HttpAdapter({
    id,
    baseUrl,
    model,
    ...(env[keyEnv] !== undefined ? { apiKey: env[keyEnv] } : {}),
    keyEnvName: keyEnv,
    costTier: isFree ? "free" : "api",
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
}

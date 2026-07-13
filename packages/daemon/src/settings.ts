import type { SessionConfig } from "@quorum/core";
import { getSecret, knownKeyEnvs } from "./secrets.js";

/**
 * The model catalog the dashboard's settings UI offers. `kind`:
 *  - "login": reuse an existing CLI login (Claude/Codex) — no key, can execute
 *  - "local": a local runtime (Ollama) — free
 *  - "api": needs an API key (stored in the Keychain)
 * `id` builds the config model id: login → bare or `id/<model>`; local/api → `prefix<model>`.
 */
export const MODEL_CATALOG = {
  providers: [
    { id: "claude", label: "Claude", kind: "login", canExecute: true, loginCmd: "claude login", logoutCmd: "claude logout", models: ["", "claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"] },
    { id: "codex", label: "Codex (OpenAI)", kind: "login", canExecute: true, loginCmd: "codex login", logoutCmd: "codex logout", models: ["", "gpt-5.5", "gpt-5"] },
    { id: "ollama", label: "Ollama · local & free", kind: "local", prefix: "ollama/", models: ["llama3", "gemma3:1b", "qwen2.5", "mistral"] },
    { id: "openrouter", label: "OpenRouter · one key, 100s of models (many free)", kind: "api", aggregator: true, prefix: "openrouter/", keyEnv: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1", fetchModels: true, models: ["deepseek/deepseek-chat:free", "meta-llama/llama-3.3-70b-instruct:free", "nousresearch/hermes-3-llama-3.1-405b:free"] },
    { id: "groq", label: "Groq · one key, fast + free tier", kind: "api", aggregator: true, prefix: "groq/", keyEnv: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1", fetchModels: true, models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "deepseek-r1-distill-llama-70b"] },
    { id: "together", label: "Together AI · one key, many open models", kind: "api", aggregator: true, prefix: "together/", keyEnv: "TOGETHER_API_KEY", baseUrl: "https://api.together.xyz/v1", fetchModels: true, models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct-Turbo"] },
    { id: "fireworks", label: "Fireworks AI · one key, many open models", kind: "api", aggregator: true, prefix: "fireworks/", keyEnv: "FIREWORKS_API_KEY", baseUrl: "https://api.fireworks.ai/inference/v1", fetchModels: true, models: ["accounts/fireworks/models/llama-v3p3-70b-instruct", "accounts/fireworks/models/deepseek-v3"] },
    { id: "deepinfra", label: "DeepInfra · one key, many open models", kind: "api", aggregator: true, prefix: "deepinfra/", keyEnv: "DEEPINFRA_API_KEY", baseUrl: "https://api.deepinfra.com/v1/openai", fetchModels: true, models: ["meta-llama/Llama-3.3-70B-Instruct", "deepseek-ai/DeepSeek-V3"] },
    { id: "openai-api", label: "OpenAI API", kind: "api", prefix: "openai-api/", keyEnv: "OPENAI_API_KEY", models: ["gpt-5.5", "gpt-5"] },
    { id: "anthropic-api", label: "Anthropic API", kind: "api", prefix: "anthropic-api/", keyEnv: "ANTHROPIC_API_KEY", models: ["claude-opus-4-8", "claude-sonnet-5"] },
    { id: "gemini-api", label: "Gemini API", kind: "api", prefix: "gemini-api/", keyEnv: "GEMINI_API_KEY", models: ["gemini-2.5-pro", "gemini-2.5-flash"] },
  ],
} as const;

export interface StructuredConfig {
  seats: Record<string, { chain: string[] }>;
  budgets?: { maxTurnsPerStage?: number; maxCostUsd?: number; wallClockMax?: string };
  providers?: Record<string, { baseUrl: string; keyEnv: string }>;
}

/** Serialize a structured config from the dashboard into .quorum/config.yaml text. */
export function configToYaml(cfg: StructuredConfig): string {
  const seats = cfg.seats ?? {};
  const providers: Record<string, { baseUrl: string; keyEnv: string }> = { ...(cfg.providers ?? {}) };

  // Auto-add the OpenRouter provider entry if any chain uses it (it needs a base_url).
  const usesOpenRouter = Object.values(seats).some((s) => (s.chain ?? []).some((m) => m.startsWith("openrouter/")));
  if (usesOpenRouter && !providers["openrouter"]) {
    providers["openrouter"] = { baseUrl: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY" };
  }

  const lines: string[] = ["seats:"];
  for (const [name, seat] of Object.entries(seats)) {
    lines.push(`  ${name}:`, `    chain: [${(seat.chain ?? []).join(", ")}]`);
  }
  const b = cfg.budgets ?? {};
  lines.push("budgets:", `  max_turns_per_stage: ${b.maxTurnsPerStage ?? 12}`);
  if (b.maxCostUsd != null) lines.push(`  max_cost_usd: ${b.maxCostUsd}`);
  if (b.wallClockMax) lines.push(`  wall_clock_max: ${b.wallClockMax}`);
  if (Object.keys(providers).length > 0) {
    lines.push("providers:");
    for (const [name, p] of Object.entries(providers)) {
      lines.push(`  ${name}:`, `    base_url: "${p.baseUrl}"`, `    key_env: ${p.keyEnv}`);
    }
  }
  return lines.join("\n") + "\n";
}

/** Which key env vars already have a value (env or Keychain), for the settings UI. */
export async function keyStatus(config: SessionConfig): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const env of knownKeyEnvs(config)) {
    out[env] = Boolean(process.env[env] || (await getSecret(env)));
  }
  return out;
}

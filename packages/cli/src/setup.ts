import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Interface as Readline } from "node:readline";
import { doctorReport } from "@quorum/daemon";
import { parseSessionConfig } from "@quorum/core";
import { setSecret } from "./keychain.js";
import { C } from "./theme.js";

export interface ProviderEntry {
  baseUrl: string;
  keyEnv: string;
}

/** Free-to-run model ids: local Ollama or an explicit :free catalog model. */
export function isFreeModel(id: string): boolean {
  return id.startsWith("ollama/") || /:free$/i.test(id);
}

/**
 * Build a .quorum/config.yaml string from selected model ids + named providers. Pure/testable.
 *
 * Default: distributes distinct "primary" models across proposer/critic/arbiter with a local
 * Ollama model (if selected) as a shared fallback.
 *
 * Frugal (opts.frugal, needs ≥1 free and ≥1 paid model): free models do the bulk drafting
 * (proposer chain is free-first), paid models verify and improve (critic/arbiter are paid-first),
 * so paid quota is spent on judgement, not volume. Executors are always Claude/Codex regardless.
 */
export function buildConfigYaml(
  models: string[],
  providers: Record<string, ProviderEntry> = {},
  opts: { frugal?: boolean } = {},
): string {
  const uniq = (xs: (string | undefined)[]): string[] => [...new Set(xs.filter((x): x is string => Boolean(x)))];
  const frees = models.filter(isFreeModel);
  const paids = models.filter((m) => !isFreeModel(m));

  let seats: Record<string, string[]>;
  if (opts.frugal && frees.length > 0 && paids.length > 0) {
    seats = {
      proposer: uniq([...frees, ...paids]), // free-first: drafting volume costs nothing
      critic: uniq([...paids, ...frees]), // paid-first: verification quality
      arbiter: uniq([...[...paids].reverse(), ...frees]), // a different paid model when available
    };
  } else {
    const fallback = models.find((m) => m.startsWith("ollama/"));
    const primaries = models.filter((m) => !m.startsWith("ollama/"));
    const pick = (i: number): string | undefined => primaries[i % Math.max(primaries.length, 1)] ?? fallback ?? models[0];
    seats = {
      proposer: uniq([pick(0), fallback]),
      critic: uniq([pick(1), fallback]),
      arbiter: uniq([pick(2), fallback]),
    };
  }

  const lines: string[] = ["seats:"];
  for (const [name, chain] of Object.entries(seats)) {
    lines.push(`  ${name}:`, `    chain: [${chain.join(", ")}]`);
  }
  lines.push("budgets:", "  max_turns_per_stage: 12", "  max_cost_usd: 5.0");
  if (Object.keys(providers).length > 0) {
    lines.push("providers:");
    for (const [name, p] of Object.entries(providers)) {
      lines.push(`  ${name}:`, `    base_url: "${p.baseUrl}"`, `    key_env: ${p.keyEnv}`);
    }
  }
  return lines.join("\n") + "\n";
}

const ask = (rl: Readline, q: string): Promise<string> =>
  new Promise((res) => {
    try {
      rl.question(q, (a) => res(a.trim()));
    } catch {
      res("");
    }
  });

export type DetectFn = () => Promise<Map<string, { ok: boolean; canExecute: boolean }>>;
export type FetchModelsFn = (baseUrl: string, key: string) => Promise<Array<{ id: string; free: boolean }>>;

async function defaultDetect(): Promise<Map<string, { ok: boolean; canExecute: boolean }>> {
  const probe = parseSessionConfig({
    seats: { proposer: { chain: ["claude"] }, critic: { chain: ["codex"] }, arbiter: { chain: ["ollama/llama3"] } },
  });
  const report = await doctorReport(probe);
  return new Map(report.map((r) => [r.id, { ok: r.ok, canExecute: r.canExecute }]));
}

/** Fetch a provider's model list (OpenAI-compatible /models). Marks free models. */
async function defaultFetchModels(baseUrl: string, key: string): Promise<Array<{ id: string; free: boolean }>> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, { headers: { authorization: `Bearer ${key}` } });
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: Array<{ id?: string; pricing?: { prompt?: string } }> };
  return (data.data ?? [])
    .filter((m): m is { id: string; pricing?: { prompt?: string } } => typeof m.id === "string")
    .map((m) => ({ id: m.id, free: /:free$/i.test(m.id) || m.pricing?.prompt === "0" }));
}

/** Let the user pick a model from a list (free ones first), or type any model id. */
async function pickModel(rl: Readline, models: Array<{ id: string; free: boolean }>, fallbackDefault: string): Promise<string> {
  if (models.length === 0) {
    return (await ask(rl, `  Which model? [${fallbackDefault}] : `)) || fallbackDefault;
  }
  const freeCount = models.filter((m) => m.free).length;
  const sorted = [...models].sort((a, b) => Number(b.free) - Number(a.free) || a.id.localeCompare(b.id)).slice(0, 15);
  console.log(`\n  ${C.dim(`${models.length} models available (${freeCount} free) — free shown first:`)}`);
  sorted.forEach((m, i) => console.log(`    ${C.dim(`[${i + 1}]`)} ${m.id}${m.free ? C.green(" (free)") : ""}`));
  const ans = await ask(rl, `  Pick a number, or type any model id [${sorted[0]!.id}] : `);
  if (!ans) return sorted[0]!.id;
  const n = Number(ans);
  if (Number.isInteger(n) && n >= 1 && n <= sorted.length) return sorted[n - 1]!.id;
  return ans; // typed a model id directly
}

/** Auto-pick up to 3 distinct models to spread across the three seats: a free one to draft, then
 *  stronger ones to critique/arbitrate (falls back to whatever's available). */
function autoSpread(models: Array<{ id: string; free: boolean }>): string[] {
  const free = models.filter((m) => m.free).map((m) => m.id);
  const paid = models.filter((m) => !m.free).map((m) => m.id);
  const out = [free[0], paid[0], paid[1] ?? free[1]].filter((x): x is string => Boolean(x));
  const uniq = [...new Set(out)];
  return uniq.length > 0 ? uniq : models.slice(0, 3).map((m) => m.id);
}

/** Let the user pick SEVERAL models from one provider (aggregator) to fill proposer/critic/arbiter
 *  from a single key — or 'A' to auto-pick a balanced spread. */
async function pickModels(rl: Readline, models: Array<{ id: string; free: boolean }>, fallbackDefault: string): Promise<string[]> {
  if (models.length === 0) {
    const a = await ask(rl, `  Which model(s)? comma-separated, or one for all seats [${fallbackDefault}] : `);
    return a ? a.split(/[,\s]+/).filter(Boolean) : [fallbackDefault];
  }
  const freeCount = models.filter((m) => m.free).length;
  const sorted = [...models].sort((a, b) => Number(b.free) - Number(a.free) || a.id.localeCompare(b.id)).slice(0, 20);
  console.log(`\n  ${C.dim(`${models.length} models on this one key (${freeCount} free) — free shown first:`)}`);
  sorted.forEach((m, i) => console.log(`    ${C.dim(`[${i + 1}]`)} ${m.id}${m.free ? C.green(" (free)") : ""}`));
  console.log(`  ${C.dim("Pick several (e.g. 1,2,3) to seat different models at proposer/critic/arbiter — or A to auto-pick a mix.")}`);
  const ans = await ask(rl, `  Your pick [A] : `);
  if (!ans || /^a$/i.test(ans)) return autoSpread(sorted);
  const out = ans.split(/[,\s]+/).filter(Boolean).map((p) => {
    const n = Number(p);
    return Number.isInteger(n) && n >= 1 && n <= sorted.length ? sorted[n - 1]!.id : p;
  });
  return out.length > 0 ? out : [sorted[0]!.id];
}

/** Ask which specific model to use for a subscription seat (claude/codex) via a numbered menu. */
async function askModel(rl: Readline, label: string, suggestions: string[], bareId: string): Promise<string> {
  console.log(`\n  ${label} — which model?`);
  console.log(`    ${C.dim("[0]")} account default ${C.dim("(recommended)")}`);
  suggestions.forEach((m, i) => console.log(`    ${C.dim(`[${i + 1}]`)} ${m}`));
  const a = await ask(rl, `  Pick a number (or type a model id) [0] : `);
  if (!a || a === "0") return bareId;
  const n = Number(a);
  if (Number.isInteger(n) && n >= 1 && n <= suggestions.length) return `${bareId}/${suggestions[n - 1]}`;
  return `${bareId}/${a}`; // typed a custom id
}

interface ApiProvider {
  label: string;
  keyEnv: string;
  baseUrl: string;
  idPrefix: string; // config model id prefix
  needsProviderEntry: boolean; // openrouter needs a config providers: entry; built-ins don't
  defaultModel: string;
  note: string;
  aggregator?: boolean; // one key → many models: offer to pick several to fill the whole table
}

// Aggregators (one key, many models) first, then direct provider APIs. Numbers are the menu keys;
// 1–3 (Claude/Codex/Ollama) are handled separately above, so these start at 4.
const API_PROVIDERS: Record<string, ApiProvider> = {
  "4": { label: "OpenRouter", keyEnv: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1", idPrefix: "openrouter", needsProviderEntry: true, defaultModel: "deepseek/deepseek-chat:free", note: "100s of models, many free", aggregator: true },
  "5": { label: "Groq", keyEnv: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1", idPrefix: "groq", needsProviderEntry: false, defaultModel: "llama-3.3-70b-versatile", note: "very fast, free tier", aggregator: true },
  "6": { label: "Together AI", keyEnv: "TOGETHER_API_KEY", baseUrl: "https://api.together.xyz/v1", idPrefix: "together", needsProviderEntry: false, defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo", note: "many open models", aggregator: true },
  "7": { label: "Fireworks AI", keyEnv: "FIREWORKS_API_KEY", baseUrl: "https://api.fireworks.ai/inference/v1", idPrefix: "fireworks", needsProviderEntry: false, defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct", note: "many open models", aggregator: true },
  "8": { label: "DeepInfra", keyEnv: "DEEPINFRA_API_KEY", baseUrl: "https://api.deepinfra.com/v1/openai", idPrefix: "deepinfra", needsProviderEntry: false, defaultModel: "meta-llama/Llama-3.3-70B-Instruct", note: "many open models", aggregator: true },
  "9": { label: "OpenAI", keyEnv: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1", idPrefix: "openai-api", needsProviderEntry: false, defaultModel: "gpt-5.5", note: "gpt-5.5, gpt-5" },
  "10": { label: "Anthropic", keyEnv: "ANTHROPIC_API_KEY", baseUrl: "https://api.anthropic.com/v1", idPrefix: "anthropic-api", needsProviderEntry: false, defaultModel: "claude-opus-4-8", note: "opus 4.8, sonnet 5" },
  "11": { label: "Gemini", keyEnv: "GEMINI_API_KEY", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", idPrefix: "gemini-api", needsProviderEntry: false, defaultModel: "gemini-2.5-pro", note: "gemini 2.5 pro/flash" },
};

/**
 * Interactive model setup — no file editing. Detects logins, lets the user pick models (and for API
 * providers, pick the actual model from a fetched list), captures keys into the Keychain, writes config.
 */
export async function runSetup(
  projectRoot: string,
  rl: Readline,
  opts: { detect?: DetectFn; fetchModels?: FetchModelsFn } = {},
): Promise<void> {
  console.log(`\n${C.bold("Set up your models.")} Checking what you're logged into…\n`);
  const status = await (opts.detect ?? defaultDetect)();
  const fetchModels = opts.fetchModels ?? defaultFetchModels;

  const line = (id: string, label: string): string => {
    const r = status.get(id);
    const mark = r?.ok ? C.green("✓") : C.dim("—");
    const note = r?.ok ? (r.canExecute ? "logged in, can build" : "reachable") : "not set up";
    return `  ${mark} ${label} ${C.dim(`(${note})`)}`;
  };
  console.log(line("claude", "[1] Claude    ") + C.dim(" — can build"));
  console.log(line("codex", "[2] Codex     ") + C.dim(" — can build"));
  console.log(line("ollama/llama3", "[3] Ollama    "));
  console.log(`\n  ${C.bold("One key → many models")} ${C.dim("(no need to subscribe to each AI — one of these can fill the whole table):")}`);
  for (const [k, p] of Object.entries(API_PROVIDERS)) {
    if (p.aggregator) console.log(`  ${C.dim("—")} [${k}] ${p.label.padEnd(12)} ${C.dim(`(${p.note})`)}`);
  }
  console.log(`\n  ${C.dim("Direct provider APIs:")}`);
  for (const [k, p] of Object.entries(API_PROVIDERS)) {
    if (!p.aggregator) console.log(`  ${C.dim("—")} [${k}] ${p.label.padEnd(12)} ${C.dim(`(${p.note})`)}`);
  }
  console.log("");

  const chosen = await ask(rl, "Which do you want at the table? (e.g. 1,2 — or just 4 for one key with many models) : ");
  const nums = new Set(chosen.split(/[,\s]+/).map((s) => s.trim()));
  const models: string[] = [];
  const providers: Record<string, ProviderEntry> = {};

  if (nums.has("1")) models.push(await askModel(rl, "Claude", ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"], "claude"));
  if (nums.has("2")) models.push(await askModel(rl, "Codex", ["gpt-5.5", "gpt-5"], "codex"));
  if (nums.has("3")) models.push("ollama/llama3");

  for (const [key, p] of Object.entries(API_PROVIDERS)) {
    if (!nums.has(key)) continue;
    const apiKey = await ask(rl, `  Paste your ${p.label} API key ${C.dim("(stored in your Keychain, never a file)")}: `);
    if (!apiKey) continue;
    const saved = await setSecret(p.keyEnv, apiKey);
    console.log(saved ? `  ${C.green("✓")} Saved to your Keychain.` : `  ${C.dim(`(No Keychain here — export ${p.keyEnv} to use it.)`)}`);
    let list: Array<{ id: string; free: boolean }> = [];
    try {
      list = await fetchModels(p.baseUrl, apiKey);
    } catch {
      /* offline / bad key — fall back to typing an id */
    }
    // Aggregators can staff several seats from one key; direct APIs pick a single model.
    if (p.aggregator) {
      for (const m of await pickModels(rl, list, p.defaultModel)) models.push(`${p.idPrefix}/${m}`);
    } else {
      models.push(`${p.idPrefix}/${await pickModel(rl, list, p.defaultModel)}`);
    }
    if (p.needsProviderEntry) providers[p.idPrefix] = { baseUrl: p.baseUrl, keyEnv: p.keyEnv };
  }

  if (models.length < 1) {
    console.log("\nPick at least one model (enter its number). Nothing written — run /models again.\n");
    return;
  }

  // Cost policy: when the table mixes free and paid models, default to frugal — free models draft,
  // paid models verify and improve.
  let frugal = false;
  if (models.some(isFreeModel) && models.some((m) => !isFreeModel(m))) {
    const ans = await ask(rl, `  Frugal mode — draft with FREE models, use paid only to verify & improve? [Y/n] : `);
    frugal = !/^n/i.test(ans);
  }

  const yaml = buildConfigYaml(models, providers, { frugal });
  await mkdir(join(projectRoot, ".quorum"), { recursive: true });
  await writeFile(join(projectRoot, ".quorum", "config.yaml"), yaml, "utf8");
  const canBuild = models.some((m) => /^(claude|codex)(\/|$)/.test(m));
  if (models.length === 1) {
    console.log(`\n${C.green("✓")} Configured — ${C.bold(models[0]!)} will play all three roles (proposer, critic, arbiter).`);
    console.log(`  ${C.dim("Add more models anytime with /models for diverse perspectives.")}`);
  } else {
    console.log(`\n${C.green("✓")} Configured ${models.length} models across proposer / critic / arbiter.`);
  }
  if (canBuild) {
    console.log("  You can plan AND build. Type a goal to begin.\n");
  } else {
    console.log(`  ${C.dim("These models plan, debate & verify. To also BUILD code autonomously, add Claude or Codex")}`);
    console.log(`  ${C.dim("(run /models, pick [1] or [2] and log in) — they're the executors. Type a goal to begin.")}\n`);
  }
}

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

/**
 * Build a .quorum/config.yaml string from selected model ids + named providers. Pure/testable.
 * Distributes distinct "primary" models across proposer/critic/arbiter and appends a local Ollama
 * model (if selected) as a shared fallback in every chain.
 */
export function buildConfigYaml(models: string[], providers: Record<string, ProviderEntry> = {}): string {
  const fallback = models.find((m) => m.startsWith("ollama/"));
  const primaries = models.filter((m) => !m.startsWith("ollama/"));
  const uniq = (xs: (string | undefined)[]): string[] => [...new Set(xs.filter((x): x is string => Boolean(x)))];
  const pick = (i: number): string | undefined => primaries[i % Math.max(primaries.length, 1)] ?? fallback ?? models[0];

  const seats: Record<string, string[]> = {
    proposer: uniq([pick(0), fallback]),
    critic: uniq([pick(1), fallback]),
    arbiter: uniq([pick(2), fallback]),
  };

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

/** Ask which specific model to use for a subscription seat (claude/codex). Blank = account default. */
async function askModel(rl: Readline, label: string, suggestions: string[], bareId: string): Promise<string> {
  console.log(`  ${C.dim(`${label} models: ${suggestions.join(", ")} — or leave blank for your account default`)}`);
  const m = await ask(rl, `  Which ${label} model? [default] : `);
  return m ? `${bareId}/${m}` : bareId;
}

interface ApiProvider {
  label: string;
  keyEnv: string;
  baseUrl: string;
  idPrefix: string; // config model id prefix
  needsProviderEntry: boolean; // openrouter yes; built-in openai-api/anthropic-api no
  defaultModel: string;
}

const API_PROVIDERS: Record<string, ApiProvider> = {
  "4": { label: "OpenRouter", keyEnv: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1", idPrefix: "openrouter", needsProviderEntry: true, defaultModel: "deepseek/deepseek-chat:free" },
  "5": { label: "OpenAI", keyEnv: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1", idPrefix: "openai-api", needsProviderEntry: false, defaultModel: "gpt-5.5" },
  "6": { label: "Anthropic", keyEnv: "ANTHROPIC_API_KEY", baseUrl: "https://api.anthropic.com/v1", idPrefix: "anthropic-api", needsProviderEntry: false, defaultModel: "claude-opus-4-8" },
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
  console.log(line("claude", "[1] Claude    "));
  console.log(line("codex", "[2] Codex     "));
  console.log(line("ollama/llama3", "[3] Ollama    "));
  console.log(`  ${C.dim("—")} [4] OpenRouter ${C.dim("(free & paid — paste key, then pick a model)")}`);
  console.log(`  ${C.dim("—")} [5] OpenAI     ${C.dim("(API key, then pick a model, e.g. gpt-5.5)")}`);
  console.log(`  ${C.dim("—")} [6] Anthropic  ${C.dim("(API key, then pick a model, e.g. opus 4.8)")}`);
  console.log("");

  const chosen = await ask(rl, "Which do you want at the table? (e.g. 1,2 or 1,5) : ");
  const nums = new Set(chosen.split(/[,\s]+/).map((s) => s.trim()));
  const models: string[] = [];
  const providers: Record<string, ProviderEntry> = {};

  if (nums.has("1")) models.push(await askModel(rl, "Claude", ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"], "claude"));
  if (nums.has("2")) models.push(await askModel(rl, "Codex", ["gpt-5.5", "gpt-5"], "codex"));
  if (nums.has("3")) models.push("ollama/llama3");

  for (const key of ["4", "5", "6"]) {
    if (!nums.has(key)) continue;
    const p = API_PROVIDERS[key]!;
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
    const model = await pickModel(rl, list, p.defaultModel);
    models.push(`${p.idPrefix}/${model}`);
    if (p.needsProviderEntry) providers[p.idPrefix] = { baseUrl: p.baseUrl, keyEnv: p.keyEnv };
  }

  if (models.length < 1) {
    console.log("\nPick at least one model (enter its number). Nothing written — run /models again.\n");
    return;
  }

  const yaml = buildConfigYaml(models, providers);
  await mkdir(join(projectRoot, ".quorum"), { recursive: true });
  await writeFile(join(projectRoot, ".quorum", "config.yaml"), yaml, "utf8");
  const canBuild = models.some((m) => /^(claude|codex)(\/|$)/.test(m));
  if (models.length === 1) {
    console.log(`\n${C.green("✓")} Configured — ${C.bold(models[0]!)} will play all three roles (proposer, critic, arbiter).`);
    console.log(`  ${C.dim("Add more models anytime with /models for diverse perspectives.")}`);
  } else {
    console.log(`\n${C.green("✓")} Configured ${models.length} models across proposer / critic / arbiter.`);
  }
  console.log(canBuild ? "  You can plan AND build. Type a goal to begin.\n" : `  ${C.dim("You can plan (no claude/codex → can't build autonomously).")} Type a goal to begin.\n`);
}

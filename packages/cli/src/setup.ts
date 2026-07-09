import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Interface as Readline } from "node:readline";
import { doctorReport } from "@quorum/daemon";
import { parseSessionConfig } from "@quorum/core";
import { setSecret, keychainAvailable } from "./keychain.js";

export interface ProviderEntry {
  baseUrl: string;
  keyEnv: string;
}

/**
 * Build a .quorum/config.yaml string from selected model ids + named providers. Pure/testable.
 * Distributes distinct "primary" models (claude/codex/http) across proposer/critic/arbiter and
 * appends the local Ollama model (if selected) as a shared fallback in every chain.
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
    lines.push(`  ${name}:`);
    lines.push(`    chain: [${chain.join(", ")}]`);
  }
  lines.push("budgets:", "  max_turns_per_stage: 12", "  max_cost_usd: 5.0");
  if (Object.keys(providers).length > 0) {
    lines.push("providers:");
    for (const [name, p] of Object.entries(providers)) {
      lines.push(`  ${name}:`);
      lines.push(`    base_url: "${p.baseUrl}"`);
      lines.push(`    key_env: ${p.keyEnv}`);
    }
  }
  return lines.join("\n") + "\n";
}

const ask = (rl: Readline, q: string): Promise<string> =>
  new Promise((res) => {
    try {
      rl.question(q, (a) => res(a.trim()));
    } catch {
      res(""); // readline closed (e.g. piped stdin hit EOF)
    }
  });

export type DetectFn = () => Promise<Map<string, { ok: boolean; canExecute: boolean }>>;

/** Default detection: probe claude/codex/ollama via a throwaway config. */
async function defaultDetect(): Promise<Map<string, { ok: boolean; canExecute: boolean }>> {
  const probe = parseSessionConfig({
    seats: { proposer: { chain: ["claude"] }, critic: { chain: ["codex"] }, arbiter: { chain: ["ollama/llama3"] } },
  });
  const report = await doctorReport(probe);
  return new Map(report.map((r) => [r.id, { ok: r.ok, canExecute: r.canExecute }]));
}

/**
 * Interactive model setup — no file editing. Detects logins, lets the user pick models, captures
 * API keys into the Keychain, and writes .quorum/config.yaml.
 */
export async function runSetup(projectRoot: string, rl: Readline, opts: { detect?: DetectFn } = {}): Promise<void> {
  console.log("\nLet's set up your models. Checking what you're logged into…\n");
  const status = await (opts.detect ?? defaultDetect)();
  const line = (id: string, label: string): string => {
    const r = status.get(id);
    const mark = r?.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[2m—\x1b[0m";
    const note = r?.ok ? (r.canExecute ? "logged in, can build" : "reachable") : "not set up";
    return `  ${mark} ${label} \x1b[2m(${note})\x1b[0m`;
  };

  console.log(line("claude", "[1] Claude   "));
  console.log(line("codex", "[2] Codex    "));
  console.log(line("ollama/llama3", "[3] Ollama   "));
  console.log("  \x1b[2m—\x1b[0m [4] OpenRouter \x1b[2m(free & paid models, needs an API key)\x1b[0m");
  console.log("");

  const chosen = await ask(rl, "Which do you want at the table? (e.g. 1,2,3) : ");
  const nums = new Set(chosen.split(/[,\s]+/).map((s) => s.trim()));
  const models: string[] = [];
  const providers: Record<string, ProviderEntry> = {};

  if (nums.has("1")) models.push("claude");
  if (nums.has("2")) models.push("codex");
  if (nums.has("3")) models.push("ollama/llama3");
  if (nums.has("4")) {
    const key = await ask(rl, "  Paste your OpenRouter API key (stored securely, not in any file): ");
    if (key) {
      const saved = await setSecret("OPENROUTER_API_KEY", key);
      console.log(saved ? "  ✓ Saved to your Keychain." : "  (No Keychain here — export OPENROUTER_API_KEY to use it.)");
      const model = (await ask(rl, "  Which OpenRouter model? [deepseek/deepseek-chat:free] : ")) || "deepseek/deepseek-chat:free";
      models.push(`openrouter/${model}`);
      providers["openrouter"] = { baseUrl: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY" };
      void keychainAvailable;
    }
  }

  if (models.length < 1) {
    console.log("\nPick at least one model (enter its number). Nothing written — run /models again.\n");
    return;
  }

  const yaml = buildConfigYaml(models, providers);
  await mkdir(join(projectRoot, ".quorum"), { recursive: true });
  await writeFile(join(projectRoot, ".quorum", "config.yaml"), yaml, "utf8");
  const canBuild = models.some((m) => m === "claude" || m === "codex");
  if (models.length === 1) {
    console.log(`\n✓ Configured — ${models[0]} will play all three roles (proposer, critic, arbiter).`);
    console.log("  \x1b[2mAdd more models anytime with /models for diverse perspectives.\x1b[0m");
  } else {
    console.log(`\n✓ Configured ${models.length} models across proposer / critic / arbiter.`);
  }
  console.log(canBuild ? "  You can plan AND build. Type a goal to begin.\n" : "  You can plan (no claude/codex → can't build autonomously). Type a goal to begin.\n");
}

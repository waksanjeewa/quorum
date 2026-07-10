import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Interface as Readline } from "node:readline";
import { parseSessionConfig } from "@quorum/core";
import { buildConfigYaml, runSetup } from "./setup.js";
import { parse as parseYaml } from "yaml";

/** Minimal fake readline that returns queued answers. */
function fakeRl(answers: string[]): Readline {
  const queue = [...answers];
  return {
    question: (_q: string, cb: (a: string) => void) => cb(queue.shift() ?? ""),
    pause: () => {},
    resume: () => {},
    close: () => {},
  } as unknown as Readline;
}

describe("buildConfigYaml", () => {
  it("distributes claude/codex across seats with ollama as a shared fallback", () => {
    const yaml = buildConfigYaml(["claude", "codex", "ollama/llama3"]);
    const cfg = parseSessionConfig(parseYaml(yaml));
    expect(cfg.seats.proposer?.chain).toEqual(["claude", "ollama/llama3"]);
    expect(cfg.seats.critic?.chain).toEqual(["codex", "ollama/llama3"]);
    expect(cfg.seats.arbiter?.chain[0]).toBe("claude");
    expect(cfg.seats.arbiter?.chain).toContain("ollama/llama3");
  });

  it("emits a providers block and OpenRouter model", () => {
    const yaml = buildConfigYaml(
      ["claude", "openrouter/deepseek/deepseek-chat:free"],
      { openrouter: { baseUrl: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY" } },
    );
    const cfg = parseSessionConfig(parseYaml(yaml));
    expect(cfg.providers.openrouter?.keyEnv).toBe("OPENROUTER_API_KEY");
    expect(Object.values(cfg.seats).some((s) => s.chain.some((m) => m.startsWith("openrouter/")))).toBe(true);
  });

  it("frugal mode: free models draft (proposer), paid verify (critic/arbiter)", () => {
    const yaml = buildConfigYaml(
      ["claude", "codex", "openrouter/deepseek/deepseek-chat:free", "ollama/llama3"],
      { openrouter: { baseUrl: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY" } },
      { frugal: true },
    );
    const cfg = parseSessionConfig(parseYaml(yaml));
    // proposer drafts on free models first
    expect(cfg.seats.proposer?.chain[0]).toMatch(/:free$|^ollama\//);
    // critic + arbiter verify on paid models first, and differ when possible
    expect(cfg.seats.critic?.chain[0]).toBe("claude");
    expect(cfg.seats.arbiter?.chain[0]).toBe("codex");
    // everyone still has the free fallback somewhere
    expect(cfg.seats.critic?.chain).toContain("ollama/llama3");
  });

  it("spreads several models from ONE aggregator key across the three seats", () => {
    const yaml = buildConfigYaml(
      ["openrouter/deepseek/deepseek-chat:free", "openrouter/anthropic/claude-3.5", "openrouter/openai/gpt-4o"],
      { openrouter: { baseUrl: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY" } },
    );
    const cfg = parseSessionConfig(parseYaml(yaml));
    const leads = [cfg.seats.proposer!.chain[0], cfg.seats.critic!.chain[0], cfg.seats.arbiter!.chain[0]];
    // distinct models lead the three seats — a full roundtable from a single subscription
    expect(new Set(leads).size).toBeGreaterThanOrEqual(2);
    expect(leads.every((m) => m!.startsWith("openrouter/"))).toBe(true);
  });

  it("handles an ollama-only selection (all seats same model)", () => {
    const cfg = parseSessionConfig(parseYaml(buildConfigYaml(["ollama/llama3", "ollama/llama3"])));
    expect(cfg.seats.proposer?.chain).toEqual(["ollama/llama3"]);
    expect(Object.keys(cfg.seats)).toHaveLength(3);
  });
});

describe("runSetup (interactive flow)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "quorum-setup-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const detect = async (): Promise<Map<string, { ok: boolean; canExecute: boolean }>> =>
    new Map([
      ["claude", { ok: true, canExecute: true }],
      ["codex", { ok: true, canExecute: true }],
      ["ollama/llama3", { ok: true, canExecute: false }],
    ]);

  it("writes a config from a 1,2,3 selection", async () => {
    await runSetup(dir, fakeRl(["1,2,3"]), { detect });
    const cfg = parseSessionConfig(parseYaml(await readFile(join(dir, ".quorum", "config.yaml"), "utf8")));
    expect(cfg.seats.proposer?.chain).toContain("claude");
    expect(cfg.seats.critic?.chain).toContain("codex");
    expect(Object.values(cfg.seats).every((s) => s.chain.includes("ollama/llama3"))).toBe(true);
  });

  it("staffs all three seats with a single picked model", async () => {
    await runSetup(dir, fakeRl(["1"]), { detect }); // just Claude
    const cfg = parseSessionConfig(parseYaml(await readFile(join(dir, ".quorum", "config.yaml"), "utf8")));
    expect(Object.values(cfg.seats).every((s) => s.chain.length === 1 && s.chain[0] === "claude")).toBe(true);
    expect(Object.keys(cfg.seats)).toHaveLength(3);
  });

  it("writes nothing when no valid model is picked", async () => {
    await runSetup(dir, fakeRl(["9"]), { detect });
    await expect(readFile(join(dir, ".quorum", "config.yaml"), "utf8")).rejects.toThrow();
  });

  it("captures a specific claude model when the user names one", async () => {
    // answers: pick [1] Claude, then model "claude-opus-4-8"
    await runSetup(dir, fakeRl(["1", "claude-opus-4-8"]), { detect });
    const cfg = parseSessionConfig(parseYaml(await readFile(join(dir, ".quorum", "config.yaml"), "utf8")));
    expect(cfg.seats.proposer?.chain).toContain("claude/claude-opus-4-8");
  });

  it("uses the bare account default when no model is named", async () => {
    await runSetup(dir, fakeRl(["1", ""]), { detect });
    const cfg = parseSessionConfig(parseYaml(await readFile(join(dir, ".quorum", "config.yaml"), "utf8")));
    expect(cfg.seats.proposer?.chain).toContain("claude");
  });
});

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

  it("writes nothing when fewer than 2 models are picked", async () => {
    await runSetup(dir, fakeRl(["3"]), { detect });
    await expect(readFile(join(dir, ".quorum", "config.yaml"), "utf8")).rejects.toThrow();
  });
});

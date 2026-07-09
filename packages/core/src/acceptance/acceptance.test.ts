import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractCommands, runAcceptance } from "./acceptance.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "quorum-acc-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const sig = () => new AbortController().signal;

describe("runAcceptance", () => {
  it("passes when all commands exit 0", async () => {
    const res = await runAcceptance(dir, ["true", "echo hello"], sig());
    expect(res.passed).toBe(true);
    expect(res.results).toHaveLength(2);
    expect(res.results[1]?.output).toContain("hello");
  });

  it("fails (without throwing) when any command exits non-zero", async () => {
    const res = await runAcceptance(dir, ["true", "false"], sig());
    expect(res.passed).toBe(false);
    expect(res.results.find((r) => r.command === "false")?.exitCode).not.toBe(0);
  });

  it("runs in the given cwd", async () => {
    const res = await runAcceptance(dir, ["pwd"], sig());
    expect(res.results[0]?.output).toContain(dir.replace("/private", "")); // macOS symlink tolerance
  });

  it("times out a hanging command", async () => {
    const res = await runAcceptance(dir, ["sleep 10"], sig(), { timeoutMs: 200 });
    expect(res.passed).toBe(false);
    expect(res.results[0]?.exitCode).toBe(124);
    expect(res.results[0]?.output).toContain("timed out");
  });

  it("aborts remaining commands on signal", async () => {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 100);
    const res = await runAcceptance(dir, ["sleep 5", "echo never"], ctrl.signal);
    expect(res.passed).toBe(false);
    expect(res.results[0]?.exitCode).toBe(130);
  });
});

describe("extractCommands", () => {
  it("picks $-prefixed lines as commands and ignores prose", () => {
    expect(
      extractCommands(["$ pnpm test", "migrations run cleanly", "$ node build.js", ""]),
    ).toEqual(["pnpm test", "node build.js"]);
  });
});

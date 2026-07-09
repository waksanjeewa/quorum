import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseSessionConfig, readTasks, type SeatRunner, type TurnContext } from "@quorum/core";
import { MockAdapter, type AdapterRegistry } from "@quorum/adapters";
import { Daemon } from "./daemon.js";

const exec = promisify(execFile);
const git = (cwd: string, args: string[]): Promise<unknown> => exec("git", args, { cwd });

let repo: string;
const CONFIG = parseSessionConfig({
  seats: { proposer: { chain: ["pm"] }, critic: { chain: ["cm"] } },
  budgets: { max_turns_per_stage: 20 },
});

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "quorum-auto-"));
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.email", "t@t.local"]);
  await git(repo, ["config", "user.name", "Test"]);
  await writeFile(join(repo, "README.md"), "base\n", "utf8");
  await git(repo, ["add", "-A"]);
  await git(repo, ["commit", "-m", "init"]);
});
afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

/** Proposer that both drives convergence AND answers the decompose prompt with task JSON. */
function proposer(): MockAdapter {
  return new MockAdapter({
    id: "pm",
    script: Array.from({ length: 40 }, () => (ctx: TurnContext) => {
      if (ctx.roleInstructions.includes("JSON array")) {
        return { status: "ok" as const, content: '[{"title":"make the file","acceptance":["test -f made.txt"],"owned_paths":["made.txt"]}]' };
      }
      return ctx.turnInStage >= 4
        ? { status: "ok" as const, content: `Final ${ctx.stage}.\nmove: PROPOSE_CONVERGE` }
        : { status: "ok" as const, content: `idea @${ctx.turnInStage}` };
    }),
  });
}
const approver = (): MockAdapter =>
  new MockAdapter({
    id: "cm",
    script: Array.from({ length: 40 }, () => (ctx: TurnContext) =>
      ctx.turnInStage >= 3 ? { status: "ok" as const, content: "ok\nmove: APPROVE" } : { status: "ok" as const, content: "considering" },
    ),
  });

describe("autonomous pipeline (deliberate → decompose → execute)", () => {
  it("plans, decomposes into a task, executes it in a worktree, and merges to main", async () => {
    const registry: AdapterRegistry = { get: (id) => ({ pm: proposer(), cm: approver() })[id] };
    const makeExec = (wt: string): SeatRunner => ({
      id: "exec",
      async takeTurn() {
        await writeFile(join(wt, "made.txt"), "built\n", "utf8");
        return { status: "ok", content: "wrote made.txt" };
      },
    });

    const daemon = new Daemon({
      projectRoot: repo,
      autonomous: true,
      registryFactory: () => ({ registry }),
      executorFactory: (wt, attempt) => (attempt === 0 ? makeExec(wt) : null),
    });

    const running = await daemon.createSession("build me a file", CONFIG);
    await running.wait();

    // deliberation produced a plan; decompose produced a task; execute built + merged it
    const tasks = await readTasks(join(repo, ".quorum", "sessions", running.id));
    expect(tasks.map((t) => t.frontmatter.id)).toEqual(["001"]);
    expect(tasks[0]?.frontmatter.status).toBe("done");
    expect(await readFile(join(repo, "made.txt"), "utf8")).toContain("built");
  });

  it("skips execution in a non-git directory (deliberation only)", async () => {
    const plain = await mkdtemp(join(tmpdir(), "quorum-nogit-"));
    try {
      const registry: AdapterRegistry = { get: (id) => ({ pm: proposer(), cm: approver() })[id] };
      const daemon = new Daemon({ projectRoot: plain, autonomous: true, registryFactory: () => ({ registry }), executorFactory: () => null });
      const running = await daemon.createSession("build here", CONFIG);
      const result = await running.wait();
      expect(result?.converged).toBe(true); // planned fine, just didn't execute
      expect(running.status().state).toBe("done");
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });
});

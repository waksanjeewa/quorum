import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSessionConfig } from "../types/index.js";
import { createSession, readEvents, readTasks, sessionFiles, writeTask } from "../ledger/index.js";
import { git } from "../workspace/git.js";
import type { SeatRunner } from "./engine.js";
import { runExecuteStage } from "./execute.js";

const CONFIG = parseSessionConfig({
  seats: { proposer: { chain: ["x"] }, critic: { chain: ["x"] } },
});

let repo: string;
beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "quorum-exec-"));
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

/** An executor bound to a worktree path that writes a file into it. */
const fileWriterAt = (worktree: string, name: string, content: string): SeatRunner => ({
  id: "exec-mock",
  async takeTurn() {
    await writeFile(join(worktree, name), content, "utf8");
    return { status: "ok", content: `wrote ${name}` };
  },
});

async function writeRuntimeTask(dir: string, id: string, acceptance: string[]): Promise<void> {
  await writeTask(join(sessionFiles.tasksDir(dir), `${id}.md`), {
    frontmatter: { id, title: `Task ${id}`, status: "todo", owned_paths: [], acceptance },
    body: "## Journal\n- (empty)\n",
  });
}

describe("runExecuteStage", () => {
  it("executes a task in a worktree, verifies, reviews, and merges to main", async () => {
    const session = await createSession(repo, "build it", CONFIG);
    await writeRuntimeTask(session.dir, "001", ["$ test -f out.txt"]);

    const result = await runExecuteStage({
      session,
      projectRoot: repo,
      makeExecutor: (wt, attempt) => (attempt === 0 ? fileWriterAt(wt, "out.txt", "hello") : null),
    });

    expect(result.completed).toEqual(["001"]);
    expect(await readFile(join(repo, "out.txt"), "utf8")).toContain("hello"); // merged to main
    const tasks = await readTasks(session.dir);
    expect(tasks[0]?.frontmatter.status).toBe("done");
    const events = await readEvents(session.dir);
    expect(events.some((e) => e.type === "task_start")).toBe(true);
    expect(events.some((e) => e.type === "task_result" && e.passed)).toBe(true);
    expect(events.some((e) => e.type === "merge" && e.result === "merged")).toBe(true);
  });

  it("fails over a usage-limited executor to the next model, same worktree", async () => {
    const session = await createSession(repo, "resilient build", CONFIG);
    await writeRuntimeTask(session.dir, "010", ["$ test -f out.txt"]);
    const limited: SeatRunner = { id: "exec-primary", async takeTurn() { return { status: "usage_limit", detail: "limit" }; } };

    const result = await runExecuteStage({
      session,
      projectRoot: repo,
      makeExecutor: (wt, attempt) => (attempt === 0 ? limited : attempt === 1 ? fileWriterAt(wt, "out.txt", "recovered") : null),
    });

    expect(result.completed).toEqual(["010"]);
    const events = await readEvents(session.dir);
    expect(events.some((e) => e.type === "seat_change" && e.reason === "usage_limit")).toBe(true);
  });

  it("blocks a task whose acceptance never passes", async () => {
    const session = await createSession(repo, "failing build", CONFIG);
    await writeRuntimeTask(session.dir, "020", ["$ test -f never.txt"]);

    const result = await runExecuteStage({
      session,
      projectRoot: repo,
      makeExecutor: () => ({ id: "noop", async takeTurn() { return { status: "ok", content: "did nothing" }; } }),
      maxIterationsPerTask: 2,
    });

    expect(result.blocked).toEqual(["020"]);
    const tasks = await readTasks(session.dir);
    expect(tasks[0]?.frontmatter.status).toBe("blocked");
  });

  it("blocks when the review rejects an otherwise-passing task", async () => {
    const session = await createSession(repo, "reviewed build", CONFIG);
    await writeRuntimeTask(session.dir, "030", ["$ test -f out.txt"]);

    const result = await runExecuteStage({
      session,
      projectRoot: repo,
      makeExecutor: (wt, attempt) => (attempt === 0 ? fileWriterAt(wt, "out.txt", "x") : null),
      review: async () => ({ approved: false, reason: "style violation" }),
      maxIterationsPerTask: 1,
    });

    expect(result.blocked).toEqual(["030"]);
    expect(result.completed).toEqual([]);
  });
});

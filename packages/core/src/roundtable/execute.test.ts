import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSessionConfig } from "../types/index.js";
import { createSession, readEvents, readTasks, sessionFiles, writeTask } from "../ledger/index.js";
import { git } from "../workspace/git.js";
import type { SeatRunner } from "./engine.js";
import { pathsOverlap, runExecuteStage } from "./execute.js";

describe("pathsOverlap", () => {
  it("detects overlap by equality and prefix", () => {
    expect(pathsOverlap(["src/"], ["src/lib"])).toBe(true);
    expect(pathsOverlap(["a.txt"], ["a.txt"])).toBe(true);
    expect(pathsOverlap(["src"], ["src/x"])).toBe(true);
  });
  it("treats disjoint paths as non-overlapping", () => {
    expect(pathsOverlap(["a.txt"], ["b.txt"])).toBe(false);
    expect(pathsOverlap(["src/api"], ["src/ui"])).toBe(false);
  });
  it("treats an empty (unknown) scope as overlapping everything", () => {
    expect(pathsOverlap([], ["anything"])).toBe(true);
    expect(pathsOverlap(["x"], [])).toBe(true);
  });
});

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

async function writeRuntimeTask(dir: string, id: string, acceptance: string[], ownedPaths: string[] = []): Promise<void> {
  await writeTask(join(sessionFiles.tasksDir(dir), `${id}.md`), {
    frontmatter: { id, title: `Task ${id}`, status: "todo", owned_paths: ownedPaths, acceptance },
    body: "## Journal\n- (empty)\n",
  });
}

/** Map a worktree path (.quorum/worktrees/<taskId>) to the file that task should create. */
function fileFor(wt: string, files: Record<string, string>): string {
  const id = wt.split("/").filter(Boolean).pop() ?? "";
  return files[id] ?? "out.txt";
}

/** Tracks how many executors run at once. */
function tracker(): { max: number; exec: (wt: string, name: string) => SeatRunner } {
  const t = { active: 0, max: 0 };
  return {
    get max() { return t.max; },
    exec: (wt: string, name: string): SeatRunner => ({
      id: "exec",
      async takeTurn() {
        t.active++;
        t.max = Math.max(t.max, t.active);
        await new Promise((r) => setTimeout(r, 60));
        await writeFile(join(wt, name), "built\n", "utf8");
        t.active--;
        return { status: "ok", content: "wrote " + name };
      },
    }),
  };
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

  it("runs disjoint tasks concurrently (Phase 3)", async () => {
    const session = await createSession(repo, "parallel build", CONFIG);
    await writeRuntimeTask(session.dir, "001", ["$ test -f a.txt"], ["a.txt"]);
    await writeRuntimeTask(session.dir, "002", ["$ test -f b.txt"], ["b.txt"]);
    await writeRuntimeTask(session.dir, "003", ["$ test -f c.txt"], ["c.txt"]);
    const files: Record<string, string> = { "001": "a.txt", "002": "b.txt", "003": "c.txt" };
    const t = tracker();

    const result = await runExecuteStage({
      session,
      projectRoot: repo,
      maxConcurrency: 3,
      makeExecutor: (wt, attempt) => (attempt === 0 ? t.exec(wt, fileFor(wt, files)) : null),
    });

    expect(result.completed.sort()).toEqual(["001", "002", "003"]);
    expect(t.max).toBe(3); // all three ran at the same time
    expect(await readFile(join(repo, "a.txt"), "utf8")).toContain("built");
  });

  it("serializes tasks whose owned_paths overlap (Phase 3 lease)", async () => {
    const session = await createSession(repo, "leased build", CONFIG);
    await writeRuntimeTask(session.dir, "001", ["$ test -f one.txt"], ["src/"]);
    await writeRuntimeTask(session.dir, "002", ["$ test -f two.txt"], ["src/lib"]); // overlaps src/
    const files: Record<string, string> = { "001": "one.txt", "002": "two.txt" };
    const t = tracker();

    const result = await runExecuteStage({
      session,
      projectRoot: repo,
      maxConcurrency: 4,
      makeExecutor: (wt, attempt) => (attempt === 0 ? t.exec(wt, fileFor(wt, files)) : null),
    });

    expect(result.completed.sort()).toEqual(["001", "002"]);
    expect(t.max).toBe(1); // never ran together — the lease held
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

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSession,
  git,
  listWorktrees,
  parseSessionConfig,
  readTasks,
  runExecuteStage,
  sessionFiles,
  writeTask,
  type SeatRunner,
} from "@quorum/core";

/** Phase 2 (Workshop) end-to-end: plan → execute one task → verify → merge, against a real repo. */

let repo: string;
const CONFIG = parseSessionConfig({ seats: { proposer: { chain: ["x"] }, critic: { chain: ["x"] } } });

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "quorum-p2e2e-"));
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

async function seedTask(dir: string, id: string, acceptance: string[]): Promise<void> {
  await writeTask(join(sessionFiles.tasksDir(dir), `${id}.md`), {
    frontmatter: { id, title: `Task ${id}`, status: "todo", owned_paths: [], acceptance },
    body: "## Journal\n- (empty)\n",
  });
}

describe("Quorum Phase 2 walking skeleton", () => {
  it("executes a task in a worktree, verifies, merges, marks done", async () => {
    const session = await createSession(repo, "ship a file", CONFIG);
    await seedTask(session.dir, "001", ["$ test -f made.txt"]);
    const executor = (wt: string): SeatRunner => ({
      id: "exec",
      async takeTurn() {
        await writeFile(join(wt, "made.txt"), "done\n", "utf8");
        return { status: "ok", content: "created made.txt" };
      },
    });

    const result = await runExecuteStage({
      session,
      projectRoot: repo,
      makeExecutor: (wt, attempt) => (attempt === 0 ? executor(wt) : null),
    });

    expect(result.completed).toEqual(["001"]);
    expect(await readFile(join(repo, "made.txt"), "utf8")).toContain("done");
    expect((await readTasks(session.dir))[0]?.frontmatter.status).toBe("done");
  });

  it("STOP mid-execute halts within 6s and leaves the worktree resumable", async () => {
    const session = await createSession(repo, "stoppable build", CONFIG);
    await seedTask(session.dir, "010", ["$ test -f made.txt"]);
    const ctrl = new AbortController();
    const hanging: SeatRunner = {
      id: "exec-hang",
      takeTurn: (_ctx, signal) =>
        new Promise((_res, rej) => {
          if (signal.aborted) return rej(Object.assign(new Error("aborted"), { name: "AbortError" }));
          signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
        }),
    };

    const t0 = Date.now();
    const p = runExecuteStage({ session, projectRoot: repo, makeExecutor: () => hanging, signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 50);
    const result = await p;

    expect(Date.now() - t0).toBeLessThan(6000);
    expect(result.completed).toEqual([]);
    // the worktree persists on disk → the task is resumable
    expect((await listWorktrees(repo)).some((w) => w.taskId === "010")).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "./git.js";
import { createWorktree, listWorktrees, mergeWorktree, removeWorktree } from "./workspace.js";

let repo: string;

async function initRepo(dir: string): Promise<void> {
  await git(dir, ["init", "-b", "main"]);
  await git(dir, ["config", "user.email", "t@t.local"]);
  await git(dir, ["config", "user.name", "Test"]);
  await writeFile(join(dir, "README.md"), "base\n", "utf8");
  await git(dir, ["add", "-A"]);
  await git(dir, ["commit", "-m", "init"]);
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "quorum-ws-"));
  await initRepo(repo);
});
afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("workspace manager", () => {
  it("rejects a non-git directory with a helpful message", async () => {
    const plain = await mkdtemp(join(tmpdir(), "quorum-plain-"));
    await expect(createWorktree(plain, "001")).rejects.toThrow(/not a git repository/);
    await rm(plain, { recursive: true, force: true });
  });

  it("creates a worktree + branch and lists it (idempotent)", async () => {
    const wt = await createWorktree(repo, "001");
    expect(wt.branch).toBe("quorum/001");
    expect(wt.path).toContain(join(".quorum", "worktrees", "001"));
    const list = await listWorktrees(repo);
    expect(list.map((w) => w.taskId)).toContain("001");
    // idempotent: second call returns the same worktree, no throw
    const again = await createWorktree(repo, "001");
    expect(again.path).toBe(wt.path);
  });

  it("merges an executor's changes back to the base branch", async () => {
    const wt = await createWorktree(repo, "010");
    await writeFile(join(wt.path, "feature.txt"), "built by executor\n", "utf8");
    const res = await mergeWorktree(repo, "010");
    expect(res).toEqual({ merged: true });
    // the file is now on main
    expect(await readFile(join(repo, "feature.txt"), "utf8")).toContain("built by executor");
  });

  it("reports a conflict (and leaves the base repo clean) instead of throwing", async () => {
    // main changes README, then a task branch also changes README from the original base → conflict
    const wt = await createWorktree(repo, "020");
    await writeFile(join(wt.path, "README.md"), "task version\n", "utf8");
    await git(wt.path, ["commit", "-am", "task edit"]);
    // diverge main
    await writeFile(join(repo, "README.md"), "main version\n", "utf8");
    await git(repo, ["commit", "-am", "main edit"]);

    const res = await mergeWorktree(repo, "020");
    expect("conflict" in res && res.conflict).toBe(true);
    if ("conflict" in res) expect(res.files).toContain("README.md");
    // base repo is clean (merge aborted)
    const status = await git(repo, ["status", "--porcelain"]);
    expect(status.stdout.trim()).toBe("");
  });

  it("removes a worktree and its branch", async () => {
    await createWorktree(repo, "030");
    await removeWorktree(repo, "030");
    const list = await listWorktrees(repo);
    expect(list.map((w) => w.taskId)).not.toContain("030");
  });
});

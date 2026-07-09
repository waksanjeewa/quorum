import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { branchExists, currentBranch, ensureGitRepo, git } from "./git.js";

export interface Worktree {
  taskId: string;
  path: string;
  branch: string;
}

export type MergeResult = { merged: true } | { conflict: true; files: string[] };

const WORKTREES_SUBDIR = join(".quorum", "worktrees");
const branchFor = (taskId: string): string => `quorum/${taskId}`;
const pathFor = (projectRoot: string, taskId: string): string => join(projectRoot, WORKTREES_SUBDIR, taskId);

/**
 * Isolated git worktree per executor task (DESIGN §13.2). Each task gets its own worktree +
 * branch so parallel executors never clobber each other's files. All git invocation for the
 * Workshop lives here.
 */
export async function createWorktree(projectRoot: string, taskId: string): Promise<Worktree> {
  await ensureGitRepo(projectRoot);
  await ensureQuorumIgnored(projectRoot);
  const path = pathFor(projectRoot, taskId);
  const branch = branchFor(taskId);

  // Idempotent: if this task's worktree already exists, reuse it.
  const existing = (await listWorktrees(projectRoot)).find((w) => w.taskId === taskId);
  if (existing) return existing;

  // Attach the existing branch if present, otherwise create it from HEAD.
  const args = (await branchExists(projectRoot, branch))
    ? ["worktree", "add", path, branch]
    : ["worktree", "add", path, "-b", branch];
  const r = await git(projectRoot, args);
  if (r.code !== 0) throw new Error(`failed to create worktree for ${taskId}: ${r.stderr.trim()}`);
  // Return git's canonical path (git may resolve symlinks, e.g. macOS /var → /private/var).
  return (await listWorktrees(projectRoot)).find((w) => w.taskId === taskId) ?? { taskId, path, branch };
}

/**
 * Locally ignore `.quorum/` in the target repo via `.git/info/exclude`, so Quorum's worktrees and
 * session files never pollute the user's `git status` — WITHOUT touching their tracked `.gitignore`.
 */
async function ensureQuorumIgnored(projectRoot: string): Promise<void> {
  const r = await git(projectRoot, ["rev-parse", "--git-common-dir"]);
  const gitDir = r.stdout.trim();
  const abs = gitDir.startsWith("/") ? gitDir : join(projectRoot, gitDir);
  const excludePath = join(abs, "info", "exclude");
  let current = "";
  try {
    current = await readFile(excludePath, "utf8");
  } catch {
    /* info/exclude may not exist yet */
  }
  if (!current.split("\n").some((l) => l.trim() === ".quorum/")) {
    await appendFile(excludePath, (current.endsWith("\n") || current === "" ? "" : "\n") + ".quorum/\n", "utf8");
  }
}

/** All Quorum-managed worktrees (branch quorum/*), parsed from `git worktree list`. */
export async function listWorktrees(projectRoot: string): Promise<Worktree[]> {
  const r = await git(projectRoot, ["worktree", "list", "--porcelain"]);
  if (r.code !== 0) return [];
  const out: Worktree[] = [];
  let path = "";
  for (const line of r.stdout.split("\n")) {
    if (line.startsWith("worktree ")) path = line.slice("worktree ".length).trim();
    else if (line.startsWith("branch ")) {
      const branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
      if (branch.startsWith("quorum/")) out.push({ taskId: branch.slice("quorum/".length), path, branch });
    }
  }
  return out;
}

/** Remove a task's worktree and delete its branch. Idempotent. */
export async function removeWorktree(projectRoot: string, taskId: string): Promise<void> {
  const path = pathFor(projectRoot, taskId);
  await git(projectRoot, ["worktree", "remove", "--force", path]);
  await git(projectRoot, ["branch", "-D", branchFor(taskId)]);
}

/**
 * Commit any pending changes in the task's worktree, then merge its branch into the base branch.
 * Returns {conflict, files} (leaving the base repo clean via merge --abort) instead of throwing.
 */
export async function mergeWorktree(projectRoot: string, taskId: string, message?: string): Promise<MergeResult> {
  const path = pathFor(projectRoot, taskId);
  const branch = branchFor(taskId);

  // Commit whatever the executor produced (no-op if the tree is clean).
  await git(path, ["add", "-A"]);
  const status = await git(path, ["status", "--porcelain"]);
  if (status.stdout.trim() !== "") {
    await git(path, ["commit", "-m", message ?? `quorum: ${taskId}`]);
  }

  const base = await currentBranch(projectRoot);
  const merge = await git(projectRoot, ["merge", "--no-ff", "-m", `quorum: merge ${taskId}`, branch]);
  if (merge.code === 0) return { merged: true };

  const conflicts = await git(projectRoot, ["diff", "--name-only", "--diff-filter=U"]);
  const files = conflicts.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  await git(projectRoot, ["merge", "--abort"]);
  void base;
  return { conflict: true, files };
}

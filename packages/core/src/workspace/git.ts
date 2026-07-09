import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Run a git command in `cwd`. Returns stdout/stderr/code without throwing on non-zero exit
 * (git's exit codes are data — e.g. a merge conflict is exit 1, not an exception).
 */
export async function git(cwd: string, args: string[]): Promise<GitResult> {
  try {
    const { stdout, stderr } = await exec("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? String(err), code: typeof e.code === "number" ? e.code : 1 };
  }
}

/** Throw if `cwd` is not inside a git work tree, with a message suggesting `git init`. */
export async function ensureGitRepo(cwd: string): Promise<void> {
  const r = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (r.code !== 0 || r.stdout.trim() !== "true") {
    throw new Error(`${cwd} is not a git repository. Run \`git init\` (and make a first commit) to use the Workshop.`);
  }
}

/** Current branch name of the repo at `cwd`. */
export async function currentBranch(cwd: string): Promise<string> {
  const r = await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return r.stdout.trim();
}

/** Whether a local branch exists. */
export async function branchExists(cwd: string, branch: string): Promise<boolean> {
  const r = await git(cwd, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
  return r.code === 0;
}

import { runAcceptance, extractCommands } from "../acceptance/index.js";
import {
  appendEvent,
  readTasks,
  updateTaskStatus,
  sessionFiles,
  type TaskFile,
} from "../ledger/index.js";
import { createWorktree, mergeWorktree, removeWorktree } from "../workspace/index.js";
import { git } from "../workspace/git.js";
import type { SessionConfig, TranscriptEvent, TurnContext, TurnResult } from "../types/index.js";
import type { SeatRunner } from "./engine.js";

/** Produce an execute-mode runner bound to a task's worktree. `attempt` walks the seat chain on
 * failover (0 = first executor model, higher = next); return null when the chain is exhausted. */
export type ExecutorFactory = (worktreePath: string, attempt: number) => SeatRunner | null;

/** Review the executor's diff (DESIGN §13.1 step 5). Wired to a roundtable by the daemon; a stub in tests. */
export type ReviewFn = (input: {
  taskId: string;
  title: string;
  diff: string;
  acceptancePassed: boolean;
}) => Promise<{ approved: boolean; reason?: string }>;

export interface RunExecuteOpts {
  session: { id: string; dir: string; config: SessionConfig };
  /** The target git repo to execute in. */
  projectRoot: string;
  makeExecutor: ExecutorFactory;
  /** Review step; default approves iff acceptance passed (daemon wires a real roundtable review). */
  review?: ReviewFn;
  now?: () => Date;
  onEvent?: (e: TranscriptEvent) => void;
  signal?: AbortSignal;
  /** Executor re-tries per task when acceptance fails. Default 2. */
  maxIterationsPerTask?: number;
}

export interface ExecuteResult {
  completed: string[];
  blocked: string[];
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

const depsSatisfied = (task: TaskFile, done: Set<string>): boolean => {
  const deps = ((task.frontmatter as { deps?: unknown }).deps as string[] | undefined) ?? [];
  return deps.every((d) => done.has(String(d)));
};

/**
 * The Workshop execute loop (DESIGN §13.1): for each eligible runtime task — isolate (worktree),
 * execute (an executor turn in that worktree, with chain failover), verify (acceptance commands),
 * review (roundtable/stub), resolve (merge + mark done, or block). All state on disk; STOP-safe.
 */
export async function runExecuteStage(opts: RunExecuteOpts): Promise<ExecuteResult> {
  const { dir } = opts.session;
  const { projectRoot } = opts;
  const now = opts.now ?? (() => new Date());
  const signal = opts.signal ?? new AbortController().signal;
  const maxIter = opts.maxIterationsPerTask ?? 2;
  const completed: string[] = [];
  const blocked: string[] = [];

  const emit = async (e: TranscriptEvent): Promise<void> => {
    await appendEvent(dir, e);
    opts.onEvent?.(e);
  };
  const ts = (): string => now().toISOString();
  const taskPath = (id: string): string => `${sessionFiles.tasksDir(dir)}/${id}.md`;

  const tasks = await readTasks(dir);
  const done = new Set(tasks.filter((t) => t.frontmatter.status === "done").map((t) => t.frontmatter.id));

  for (const task of tasks) {
    if (signal.aborted) break;
    const id = task.frontmatter.id;
    if (task.frontmatter.status === "done" || task.frontmatter.status === "blocked") continue;
    if (!depsSatisfied(task, done)) continue;

    await safeUpdateStatus(id, "in_progress");
    const worktree = await createWorktree(projectRoot, id);

    let attempt = 0;
    let runner = opts.makeExecutor(worktree.path, attempt);
    if (!runner) {
      await markBlocked(id, "no executor available");
      continue;
    }
    await emit({ ts: ts(), type: "task_start", task: id, seat: "executor", model: runner.id, worktree: worktree.path });

    let resolved = false;
    for (let iter = 1; iter <= maxIter && !resolved; iter++) {
      if (signal.aborted) break;

      // EXECUTE — one executor turn in the worktree, walking the chain on usage_limit.
      let result: TurnResult;
      try {
        result = await runner!.takeTurn(buildExecuteContext(task, worktree.path, iter), signal);
      } catch (err) {
        if (isAbort(err)) break;
        result = { status: "error", detail: String(err), retryable: false };
      }
      if (result.status === "usage_limit" || (result.status === "error" && !result.retryable)) {
        const next = opts.makeExecutor(worktree.path, ++attempt);
        if (!next) {
          await markBlocked(id, `executor exhausted: ${"detail" in result ? result.detail : ""}`);
          resolved = true;
          break;
        }
        await emit({ ts: ts(), type: "seat_change", seat: "executor", from: runner!.id, to: next.id, reason: result.status === "usage_limit" ? "usage_limit" : "error" });
        runner = next;
        iter--; // retry same iteration on the new model, same worktree
        continue;
      }

      // VERIFY — objective acceptance gate.
      const commands = extractCommands(task.frontmatter.acceptance);
      const acc = await runAcceptance(worktree.path, commands, signal);
      await emit({ ts: ts(), type: "task_result", task: id, passed: acc.passed, ...(acc.passed ? {} : { detail: firstFailure(acc.results) }) });
      if (!acc.passed && iter < maxIter) continue; // let the executor try again

      // REVIEW — subjective gate over the diff.
      const diff = (await git(worktree.path, ["diff", "HEAD"])).stdout;
      const review = opts.review
        ? await opts.review({ taskId: id, title: task.frontmatter.title, diff, acceptancePassed: acc.passed })
        : { approved: acc.passed };

      if (acc.passed && review.approved) {
        const merge = await mergeWorktree(projectRoot, id);
        if ("merged" in merge) {
          await emit({ ts: ts(), type: "merge", task: id, result: "merged" });
          await safeUpdateStatus(id, "done");
          await removeWorktree(projectRoot, id);
          done.add(id);
          completed.push(id);
        } else {
          await emit({ ts: ts(), type: "merge", task: id, result: "conflict", detail: merge.files.join(", ") });
          await safeUpdateStatus(id, "blocked");
          blocked.push(id);
        }
        resolved = true;
      } else if (iter >= maxIter) {
        await markBlocked(id, review.reason ?? "acceptance failed");
        resolved = true;
      }
    }
  }

  return { completed, blocked };

  async function safeUpdateStatus(id: string, status: "in_progress" | "done" | "blocked"): Promise<void> {
    try {
      await updateTaskStatus(taskPath(id), status);
    } catch {
      /* task file naming may differ; status is also reflected in transcript events */
    }
  }
  async function markBlocked(id: string, detail: string): Promise<void> {
    await emit({ ts: ts(), type: "merge", task: id, result: "blocked", detail });
    await safeUpdateStatus(id, "blocked");
    blocked.push(id);
  }
}

function buildExecuteContext(task: TaskFile, worktreePath: string, iter: number): TurnContext {
  const acceptance = task.frontmatter.acceptance.map((a) => `- ${a}`).join("\n");
  return {
    seat: "executor",
    role: "proposer",
    stage: "execute",
    turnInStage: iter,
    goal: task.frontmatter.title,
    summary: "",
    recentTurns: [],
    pendingInjections: [],
    roleInstructions:
      `You are an executor. Implement this task by editing files in your working directory (${worktreePath}). ` +
      `Only touch the task's owned paths. When done, ensure the acceptance criteria pass:\n${acceptance}`,
  };
}

const firstFailure = (results: { command: string; exitCode: number; output: string }[]): string => {
  const f = results.find((r) => r.exitCode !== 0);
  return f ? `\`${f.command}\` exited ${f.exitCode}` : "acceptance failed";
};

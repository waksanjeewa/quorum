import { cpus } from "node:os";
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

/** Serialize an async critical section (used so only one merge touches the base branch at a time). */
class Mutex {
  private tail = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

/** Do two owned_paths sets overlap? Empty set = unknown scope → conservatively overlaps everything. */
export function pathsOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  const norm = (p: string): string => p.replace(/\/+$/, "");
  for (const x of a.map(norm)) {
    for (const y of b.map(norm)) {
      if (x === y || x.startsWith(y + "/") || y.startsWith(x + "/")) return true;
    }
  }
  return false;
}

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
  /** Max tasks executing at once (Phase 3). Default min(4, cores-1). */
  maxConcurrency?: number;
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

  const maxConcurrency = opts.maxConcurrency ?? Math.max(1, Math.min(4, cpus().length - 1));
  const mergeLock = new Mutex();
  const tasks = await readTasks(dir);
  const done = new Set(tasks.filter((t) => t.frontmatter.status === "done").map((t) => t.frontmatter.id));
  const blockedSet = new Set<string>();

  /** Isolate → execute → verify → review → resolve for ONE task. Returns its outcome. */
  const processTask = async (task: TaskFile): Promise<"completed" | "blocked"> => {
    const id = task.frontmatter.id;
    await safeUpdateStatus(id, "in_progress");
    const worktree = await createWorktree(projectRoot, id);

    let attempt = 0;
    let runner = opts.makeExecutor(worktree.path, attempt);
    if (!runner) return emitBlocked(id, "no executor available");
    await emit({ ts: ts(), type: "task_start", task: id, seat: "executor", model: runner.id, worktree: worktree.path });

    for (let iter = 1; iter <= maxIter; iter++) {
      if (signal.aborted) return "blocked";

      let result: TurnResult;
      try {
        result = await runner!.takeTurn(buildExecuteContext(task, worktree.path, iter), signal);
      } catch (err) {
        if (isAbort(err)) return "blocked";
        result = { status: "error", detail: String(err), retryable: false };
      }
      if (result.status === "usage_limit" || (result.status === "error" && !result.retryable)) {
        const next = opts.makeExecutor(worktree.path, ++attempt);
        if (!next) return emitBlocked(id, `executor exhausted: ${"detail" in result ? result.detail : ""}`);
        await emit({ ts: ts(), type: "seat_change", seat: "executor", from: runner!.id, to: next.id, reason: result.status === "usage_limit" ? "usage_limit" : "error" });
        runner = next;
        iter--;
        continue;
      }

      const commands = extractCommands(task.frontmatter.acceptance);
      const acc = await runAcceptance(worktree.path, commands, signal);
      await emit({ ts: ts(), type: "task_result", task: id, passed: acc.passed, ...(acc.passed ? {} : { detail: firstFailure(acc.results) }) });
      if (!acc.passed && iter < maxIter) continue;

      const diff = (await git(worktree.path, ["diff", "HEAD"])).stdout;
      const review = opts.review
        ? await opts.review({ taskId: id, title: task.frontmatter.title, diff, acceptancePassed: acc.passed })
        : { approved: acc.passed };

      if (acc.passed && review.approved) {
        // Merges are serialized — only one touches the base branch at a time.
        const merge = await mergeLock.run(() => mergeWorktree(projectRoot, id));
        if ("merged" in merge) {
          await emit({ ts: ts(), type: "merge", task: id, result: "merged" });
          await safeUpdateStatus(id, "done");
          await removeWorktree(projectRoot, id);
          return "completed";
        }
        await emit({ ts: ts(), type: "merge", task: id, result: "conflict", detail: merge.files.join(", ") });
        await safeUpdateStatus(id, "blocked");
        return "blocked";
      }
      if (iter >= maxIter) return emitBlocked(id, review.reason ?? "acceptance failed");
    }
    return "blocked";
  };

  // ---- scheduler: run eligible tasks concurrently (deps + owned_paths leases + cap) ----
  const running = new Map<string, { paths: string[]; p: Promise<void> }>();
  const handled = (id: string): boolean => done.has(id) || blockedSet.has(id) || running.has(id);
  const eligible = (task: TaskFile): boolean => {
    const id = task.frontmatter.id;
    if (task.frontmatter.status === "done" || task.frontmatter.status === "blocked") return false;
    if (handled(id) || !depsSatisfied(task, done)) return false;
    const paths = task.frontmatter.owned_paths ?? [];
    for (const r of running.values()) if (pathsOverlap(paths, r.paths)) return false;
    return true;
  };

  while (!signal.aborted) {
    for (const task of tasks) {
      if (running.size >= maxConcurrency) break;
      if (!eligible(task)) continue;
      const id = task.frontmatter.id;
      const paths = task.frontmatter.owned_paths ?? [];
      const p = processTask(task).then((outcome) => {
        if (outcome === "completed") {
          done.add(id);
          completed.push(id);
        } else {
          blockedSet.add(id);
          blocked.push(id);
        }
        running.delete(id);
      });
      running.set(id, { paths, p });
    }
    if (running.size === 0) break; // nothing running and nothing startable
    await Promise.race([...running.values()].map((r) => r.p));
  }
  await Promise.allSettled([...running.values()].map((r) => r.p));

  return { completed, blocked };

  async function safeUpdateStatus(id: string, status: "in_progress" | "done" | "blocked"): Promise<void> {
    try {
      await updateTaskStatus(taskPath(id), status);
    } catch {
      /* task file naming may differ; status is also reflected in transcript events */
    }
  }
  async function emitBlocked(id: string, detail: string): Promise<"blocked"> {
    await emit({ ts: ts(), type: "merge", task: id, result: "blocked", detail });
    await safeUpdateStatus(id, "blocked");
    return "blocked";
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

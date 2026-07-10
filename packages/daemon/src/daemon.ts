import { createSession, type ExecutorFactory, type ReviewFn, type SeatRunner, type SessionConfig, type Stage } from "@quorum/core";
import type { AdapterRegistry } from "@quorum/adapters";
import { buildAdapterRegistry, buildExecutorFactory, buildReviewFn } from "./registry.js";
import { RunningSession } from "./session-runner.js";

export interface DaemonOpts {
  projectRoot: string;
  now?: () => Date;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  /** Override adapter wiring (tests inject MockAdapters). */
  registryFactory?: (config: SessionConfig) => { registry: AdapterRegistry; summarizer?: SeatRunner };
  /** Restrict stages (tests / headless). Default: engine's brainstorm → plan. */
  stages?: Stage[];
  /** After plan converges, decompose + execute in projectRoot (git repo). */
  autonomous?: boolean;
  /** Override the executor factory (tests inject mock executors). */
  executorFactory?: ExecutorFactory;
  /** Review hook over executor diffs. */
  review?: ReviewFn;
}

/**
 * Session manager (SPEC §7): creates/looks-up/lists roundtable sessions and owns their lifetimes.
 * Transport-agnostic — the HTTP server wraps this.
 */
export class Daemon {
  private readonly sessions = new Map<string, RunningSession>();
  private readonly opts: DaemonOpts;

  constructor(opts: DaemonOpts) {
    this.opts = opts;
  }

  private buildRegistry(config: SessionConfig): { registry: AdapterRegistry; summarizer?: SeatRunner } {
    if (this.opts.registryFactory) return this.opts.registryFactory(config);
    const built = buildAdapterRegistry(config, {
      ...(this.opts.env ? { env: this.opts.env } : {}),
      ...(this.opts.fetchImpl ? { fetchImpl: this.opts.fetchImpl } : {}),
    });
    const summarizer = built.summarizer();
    return { registry: built.registry, ...(summarizer ? { summarizer } : {}) };
  }

  async createSession(goal: string, config: SessionConfig): Promise<RunningSession> {
    const now = this.opts.now ?? (() => new Date());
    const session = await createSession(this.opts.projectRoot, goal, config, { now: now() });
    const { registry, summarizer } = this.buildRegistry(config);
    const executorFactory = this.opts.executorFactory ?? buildExecutorFactory(config);
    const review =
      this.opts.review ??
      (this.opts.autonomous
        ? buildReviewFn(config, { ...(this.opts.env ? { env: this.opts.env } : {}), ...(this.opts.fetchImpl ? { fetchImpl: this.opts.fetchImpl } : {}) })
        : undefined);
    const running = new RunningSession({
      session,
      registry,
      ...(summarizer ? { summarizer } : {}),
      now,
      ...(this.opts.stages ? { stages: this.opts.stages } : {}),
      projectRoot: this.opts.projectRoot,
      autonomous: this.opts.autonomous ?? false,
      executorFactory,
      ...(review ? { review } : {}),
    });
    this.sessions.set(running.id, running);
    await running.start();
    return running;
  }

  get(id: string): RunningSession | undefined {
    return this.sessions.get(id);
  }

  list(): RunningSession[] {
    return [...this.sessions.values()];
  }

  /** Kill switch for everything (SPEC §7). */
  async stopAll(): Promise<void> {
    await Promise.all(this.list().map((s) => s.stop()));
  }
}

import {
  appendEvent,
  readEvents,
  runRoundtable,
  SummaryMaintainer,
  currentStage,
  type RoundtableResult,
  type SeatId,
  type SeatRunner,
  type Session,
  type Stage,
  type TranscriptEvent,
} from "@quorum/core";
import { SeatManager, type AdapterRegistry } from "@quorum/adapters";
import { PauseGate, gatedRunner } from "./pause-gate.js";

export interface RunningSessionOpts {
  session: Session;
  registry: AdapterRegistry;
  summarizer?: SeatRunner;
  now?: () => Date;
  stages?: Stage[];
}

export type SessionState = "running" | "paused" | "done" | "stopped" | "error";

export interface SessionStatus {
  id: string;
  state: SessionState;
  stage: Stage;
  seats: Record<SeatId, { model: string; paused: boolean }>;
  turns: number;
  converged: boolean;
  stoppedReason?: RoundtableResult["stoppedReason"];
}

/** Manages one roundtable run: seats + failover + pause + summaries + event fan-out (SPEC §7). */
export class RunningSession {
  readonly id: string;
  private readonly session: Session;
  private readonly gate = new PauseGate();
  private readonly abort = new AbortController();
  private readonly seatManager: SeatManager;
  private readonly summary: SummaryMaintainer | undefined;
  private readonly now: () => Date;
  private readonly stages: Stage[] | undefined;
  /** Full event history for this run (disk history + live), for synchronous SSE replay. */
  private readonly log: TranscriptEvent[] = [];
  private readonly subscribers = new Set<(e: TranscriptEvent, index: number) => void>();
  private readonly currentModel: Record<SeatId, string> = {};
  private state: SessionState = "running";
  private result: RoundtableResult | undefined;
  private runPromise: Promise<void> | undefined;

  constructor(opts: RunningSessionOpts) {
    this.id = opts.session.id;
    this.session = opts.session;
    this.now = opts.now ?? (() => new Date());
    this.stages = opts.stages;
    this.seatManager = new SeatManager(opts.session.config, opts.registry, { now: this.now });
    this.summary = opts.summarizer ? new SummaryMaintainer(opts.session.dir, opts.summarizer) : undefined;
    for (const [seatId, cfg] of Object.entries(opts.session.config.seats)) {
      this.currentModel[seatId] = cfg.chain[0] ?? "?";
    }
  }

  /** Load prior transcript (for resume) then start the roundtable loop. */
  async start(): Promise<void> {
    for (const e of await readEvents(this.session.dir)) this.log.push(e);
    const seats = this.seatManager.seats();
    const gated: Record<SeatId, SeatRunner> = {};
    for (const [seatId, runner] of Object.entries(seats)) {
      gated[seatId] = gatedRunner(runner, this.gate);
      this.currentModel[seatId] = runner.id;
    }

    this.runPromise = runRoundtable({
      session: this.session,
      seats: gated,
      ...(this.stages ? { stages: this.stages } : {}),
      now: this.now,
      signal: this.abort.signal,
      failover: async (seatId, result) => {
        const next = await this.seatManager.failover(seatId, result);
        return next ? gatedRunner(next, this.gate) : null;
      },
      onEvent: (e) => this.onEngineEvent(e),
    })
      .then((r) => {
        this.result = r;
        this.state = r.stoppedReason === "aborted" ? "stopped" : "done";
      })
      .catch((err) => {
        this.state = "error";
        this.broadcast({ ts: this.now().toISOString(), type: "control", action: "stop", by: "system", detail: `error: ${String(err)}` });
      });
  }

  private onEngineEvent(e: TranscriptEvent): void {
    if (e.type === "seat_change") this.currentModel[e.seat] = e.to;
    this.record(e);
    if (e.type === "turn") void this.summary?.maybeUpdate(this.abort.signal).catch(() => {});
  }

  /** Push to the in-memory log and fan out to subscribers. */
  private record(e: TranscriptEvent): void {
    const index = this.log.length;
    this.log.push(e);
    for (const fn of this.subscribers) fn(e, index);
  }

  /** Append a daemon-originated event to disk + stream it. */
  private async broadcast(e: TranscriptEvent): Promise<void> {
    await appendEvent(this.session.dir, e);
    this.record(e);
  }

  async inject(content: string): Promise<void> {
    await this.broadcast({ ts: this.now().toISOString(), type: "human", content });
  }

  pause(): void {
    if (this.state !== "running") return;
    this.gate.pause();
    this.state = "paused";
    void this.broadcast({ ts: this.now().toISOString(), type: "control", action: "pause", by: "human" });
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.gate.resume();
    this.state = "running";
    void this.broadcast({ ts: this.now().toISOString(), type: "control", action: "resume", by: "human" });
  }

  async stop(): Promise<void> {
    if (this.state === "done" || this.state === "stopped") return;
    this.abort.abort();
    this.gate.resume(); // unblock any paused waiter so it observes the abort
    await this.runPromise?.catch(() => {});
    if (this.state !== "error") this.state = "stopped";
  }

  /** Wait for the roundtable to finish (used by tests / headless runs). */
  async wait(): Promise<RoundtableResult | undefined> {
    await this.runPromise?.catch(() => {});
    return this.result;
  }

  status(): SessionStatus {
    const turns = this.log.reduce((n, e) => (e.type === "turn" ? n + 1 : n), 0);
    const seats: SessionStatus["seats"] = {};
    for (const seatId of Object.keys(this.session.config.seats)) {
      seats[seatId] = { model: this.currentModel[seatId] ?? "?", paused: this.gate.isPaused() };
    }
    return {
      id: this.id,
      state: this.state,
      stage: currentStage(this.log),
      seats,
      turns,
      converged: this.result?.converged ?? false,
      ...(this.result ? { stoppedReason: this.result.stoppedReason } : {}),
    };
  }

  /** Replay the full log to a new subscriber, then stream live events. Returns an unsubscribe fn. */
  subscribe(onEvent: (e: TranscriptEvent, index: number) => void): () => void {
    this.log.forEach((e, i) => onEvent(e, i));
    this.subscribers.add(onEvent);
    return () => this.subscribers.delete(onEvent);
  }
}

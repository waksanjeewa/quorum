import type { SeatRunner } from "../roundtable/engine.js";
import type { TranscriptEvent, TurnContext } from "../types/index.js";
import { readEvents, readGoal, readSummary, writeSummary } from "../ledger/index.js";

const SUMMARY_INSTRUCTIONS =
  "You are the session's note-taker. Read the transcript and produce a concise rolling summary " +
  "under exactly these three headings:\n" +
  "## Decisions so far\n## Open threads\n## Current focus\n" +
  "State the current stage explicitly under Current focus. Keep it tight — this is the briefing a " +
  "fresh model reads when it takes over a seat.";

export interface SummaryMaintainerOpts {
  /** Update after this many new turns. Default 3. */
  everyK?: number;
  now?: () => Date;
}

/**
 * Maintains summary.md (SPEC §4 / task 070). Every K turns the cheapest seated model rewrites the
 * summary from the transcript, so buildTurnContext's summary_tail mode stays informative and any
 * model taking over a seat gets a briefing. Intended to be called off the critical path (the daemon
 * fires maybeUpdate() without awaiting it, so it never delays the next turn).
 */
export class SummaryMaintainer {
  private readonly everyK: number;
  private lastCount = 0;
  private running = false;

  constructor(
    private readonly dir: string,
    private readonly summarizer: SeatRunner,
    opts: SummaryMaintainerOpts = {},
  ) {
    this.everyK = opts.everyK ?? 3;
  }

  private countTurns(events: TranscriptEvent[]): number {
    return events.reduce((n, e) => (e.type === "turn" ? n + 1 : n), 0);
  }

  /** Update the summary if ≥K turns have accrued since the last one. Returns true if it wrote. */
  async maybeUpdate(signal?: AbortSignal): Promise<boolean> {
    if (this.running) return false; // never overlap summary passes
    const events = await readEvents(this.dir);
    const turns = this.countTurns(events);
    if (turns - this.lastCount < this.everyK) return false;

    this.running = true;
    try {
      const [goal, previous] = await Promise.all([readGoal(this.dir), readSummary(this.dir)]);
      const ctx: TurnContext = {
        seat: "summarizer",
        role: "arbiter",
        stage: "brainstorm",
        turnInStage: turns,
        goal,
        summary: previous,
        recentTurns: events,
        pendingInjections: [],
        roleInstructions: SUMMARY_INSTRUCTIONS,
      };
      const result = await this.summarizer.takeTurn(ctx, signal ?? new AbortController().signal);
      if (result.status === "ok") {
        await writeSummary(this.dir, result.content);
        this.lastCount = turns;
        return true;
      }
      return false;
    } finally {
      this.running = false;
    }
  }
}

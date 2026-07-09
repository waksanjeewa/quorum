import type { Role, SeatId, Stage, TranscriptEvent, TurnContext } from "../types/index.js";
import { readGoal, readSummary } from "./session.js";
import { readEvents } from "./transcript.js";

export interface BuildTurnContextOpts {
  seat: SeatId;
  role: Role;
  roleInstructions: string;
  /** "full" = whole transcript; "summary_tail" = summary + last `tailSize` events. Default summary_tail. */
  contextMode?: "full" | "summary_tail";
  /** How many recent events to include in summary_tail mode. Default 10. */
  tailSize?: number;
}

/** The stage in effect after applying all stage-change events (default: brainstorm). */
export function currentStage(events: TranscriptEvent[]): Stage {
  let stage: Stage = "brainstorm";
  for (const e of events) if (e.type === "stage") stage = e.to;
  return stage;
}

/** 1-based index of the *next* turn within the current stage (drives anti-sycophancy gates). */
export function turnInStage(events: TranscriptEvent[]): number {
  let lastStageIdx = -1;
  for (let i = 0; i < events.length; i++) if (events[i]?.type === "stage") lastStageIdx = i;
  let turns = 0;
  for (let i = lastStageIdx + 1; i < events.length; i++) if (events[i]?.type === "turn") turns++;
  return turns + 1;
}

/** Human messages appended after the last seat turn — queued, not yet addressed. */
export function pendingInjections(events: TranscriptEvent[]): string[] {
  const out: string[] = [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.type === "turn") break;
    if (e?.type === "human") out.unshift(e.content);
  }
  return out;
}

/**
 * Assemble what a seat sees on its turn (SPEC §4). The ledger owns the disk-derived fields
 * (goal, summary, recent events, stage, turn index, pending injections); the caller supplies
 * the seat identity, role, and role instructions (which live in the roundtable engine, task 050).
 */
export async function buildTurnContext(dir: string, opts: BuildTurnContextOpts): Promise<TurnContext> {
  const mode = opts.contextMode ?? "summary_tail";
  const tail = opts.tailSize ?? 10;
  const [goal, summary, events] = await Promise.all([readGoal(dir), readSummary(dir), readEvents(dir)]);
  const recentTurns = mode === "full" ? events : events.slice(-tail);
  return {
    seat: opts.seat,
    role: opts.role,
    stage: currentStage(events),
    turnInStage: turnInStage(events),
    goal,
    summary,
    recentTurns,
    pendingInjections: pendingInjections(events),
    roleInstructions: opts.roleInstructions,
  };
}

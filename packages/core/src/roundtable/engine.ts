import { writeFile } from "node:fs/promises";
import type {
  Move,
  SeatId,
  SessionConfig,
  Stage,
  TranscriptEvent,
  TurnContext,
  TurnResult,
} from "../types/index.js";
import {
  buildTurnContext,
  currentStage,
  readEvents,
  sessionFiles,
  appendEvent,
  turnInStage,
} from "../ledger/index.js";
import { parseMove } from "./moves.js";
import { buildRoleInstructions, type RoleInstructionFn } from "./roles.js";

/**
 * Minimal port the engine needs from a seated model. `ModelAdapter` (in @quorum/adapters)
 * satisfies this structurally — core stays free of an adapters dependency (SPEC §1 dep direction).
 */
export interface SeatRunner {
  readonly id: string;
  takeTurn(ctx: TurnContext, signal: AbortSignal): Promise<TurnResult>;
}

export interface RunRoundtableOpts {
  session: { id: string; dir: string; config: SessionConfig };
  /** Current model per seat. Failover (task 060) swaps these via the `failover` hook. */
  seats: Record<SeatId, SeatRunner>;
  /** Stages to run. Default (Phase 1): brainstorm → plan. */
  stages?: Stage[];
  /** Override role instructions entirely (else built-in templates). */
  roleInstructions?: RoleInstructionFn;
  /** Provide a replacement runner when a seat hits usage_limit / hard error, or null to pause it. */
  failover?: (seatId: SeatId, result: TurnResult) => Promise<SeatRunner | null>;
  /** Human confirmation for a model-requested stage advance (models_decide). Default: auto-yes. */
  confirmStageAdvance?: (from: Stage, to: Stage) => Promise<boolean>;
  /** Injected clock for event timestamps (keeps tests deterministic). */
  now?: () => Date;
  /** Live event hook (the daemon streams these to the dashboard). */
  onEvent?: (e: TranscriptEvent) => void;
  /** Non-transcript notes, e.g. rejected early approvals (observable for tests/logs). */
  onNote?: (note: string) => void;
  /** Kill switch. */
  signal?: AbortSignal;
  /** Retryable-error attempts on the same model before failing over. Default 2. */
  maxRetriesPerTurn?: number;
}

export type StoppedReason = "converged" | "aborted" | "budget" | "needs_human";

export interface RoundtableResult {
  converged: boolean;
  stagesCompleted: Stage[];
  stoppedReason: StoppedReason;
  notes: string[];
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/**
 * Run the roundtable (DESIGN §6). Round-robin turns over active seats; models emit moves;
 * a PROPOSE_CONVERGE triggers a vote (arbiter breaks ties); convergence writes the stage artifact
 * and advances. Budgets, the kill switch, failover, and human injection are all honored.
 * Pure orchestration — all IO goes through the injected ledger + seat runners.
 */
export async function runRoundtable(opts: RunRoundtableOpts): Promise<RoundtableResult> {
  const { dir, config } = opts.session;
  const seats = { ...opts.seats };
  const stages = opts.stages ?? ["brainstorm", "plan"];
  const now = opts.now ?? (() => new Date());
  const instr: RoleInstructionFn = opts.roleInstructions ?? buildRoleInstructions;
  const maxRetries = opts.maxRetriesPerTurn ?? 2;
  const paused = new Set<SeatId>();
  const completed: Stage[] = [];
  const notes: string[] = [];

  const emit = async (e: TranscriptEvent): Promise<void> => {
    await appendEvent(dir, e);
    opts.onEvent?.(e);
  };
  const note = (n: string): void => {
    notes.push(n);
    opts.onNote?.(n);
  };
  const ts = (): string => now().toISOString();
  const seatOrder = (): SeatId[] => Object.keys(config.seats).filter((s) => !paused.has(s));

  interface TurnOutcome {
    ok: boolean;
    paused: boolean;
    move?: Move;
    content: string;
    turnInStage: number;
    role: SessionConfig["seats"][string]["role"];
  }

  const runSeatTurn = async (seatId: SeatId): Promise<TurnOutcome> => {
    const role = config.seats[seatId]!.role;
    let runner = seats[seatId]!;
    let retries = 0;
    for (;;) {
      const base = await buildTurnContext(dir, {
        seat: seatId,
        role,
        roleInstructions: "",
        contextMode: config.contextMode,
      });
      const ctx: TurnContext = { ...base, roleInstructions: instr(role, base) };

      let result: TurnResult;
      try {
        result = await runner.takeTurn(ctx, opts.signal ?? new AbortController().signal);
      } catch (err) {
        if (isAbort(err)) throw err;
        result = { status: "error", detail: String(err), retryable: false };
      }

      if (result.status === "ok") {
        const move = result.move ?? parseMove(result.content);
        await emit({
          ts: ts(),
          type: "turn",
          seat: seatId,
          model: runner.id,
          content: result.content,
          ...(move ? { move } : {}),
          ...(result.usage ? { usage: result.usage } : {}),
        });
        return { ok: true, paused: false, content: result.content, turnInStage: ctx.turnInStage, role, ...(move ? { move } : {}) };
      }

      if (result.status === "error" && result.retryable && retries < maxRetries) {
        retries++;
        continue;
      }

      // usage_limit or hard error → walk the failover chain
      const replacement = opts.failover ? await opts.failover(seatId, result) : null;
      if (replacement) {
        await emit({
          ts: ts(),
          type: "seat_change",
          seat: seatId,
          from: runner.id,
          to: replacement.id,
          reason: result.status === "usage_limit" ? "usage_limit" : "error",
        });
        seats[seatId] = replacement;
        runner = replacement;
        retries = 0;
        continue;
      }

      paused.add(seatId);
      note(`seat ${seatId} paused: ${result.status} (${"detail" in result ? result.detail : ""})`);
      return { ok: false, paused: true, content: "", turnInStage: ctx.turnInStage, role };
    }
  };

  const runConvergenceVote = async (proposerSeat: SeatId): Promise<boolean> => {
    const voters = seatOrder().filter((s) => s !== proposerSeat);
    if (voters.length === 0) return false;
    const votes: { role: TurnOutcome["role"]; approve: boolean }[] = [];
    for (const seat of voters) {
      if (opts.signal?.aborted) return false;
      const turn = await runSeatTurn(seat);
      if (turn.paused) continue;
      let approve = turn.move === "APPROVE";
      // Anti-sycophancy: a critic may not APPROVE before turn 3 of a stage (DESIGN §6).
      if (approve && turn.role === "critic" && turn.turnInStage < 3) {
        approve = false;
        note(`rejected early APPROVE from critic seat ${seat} at turn ${turn.turnInStage} (< 3)`);
      }
      votes.push({ role: turn.role, approve });
    }
    if (votes.length === 0) return false;
    const approvals = votes.filter((v) => v.approve).length;
    const blocks = votes.length - approvals;
    if (approvals > blocks) return true;
    if (approvals < blocks) return false;
    const arbiter = votes.find((v) => v.role === "arbiter");
    return arbiter ? arbiter.approve : false;
  };

  const writeArtifact = async (stage: Stage, content: string): Promise<void> => {
    const clean = content.replace(/\n?move\s*:\s*[A-Za-z_]+\s*$/i, "").trim() + "\n";
    const path =
      stage === "plan" ? sessionFiles.spec(dir) : sessionFiles.artifactsDir(dir) + "/ideas.md";
    await writeFile(path, clean, "utf8");
  };

  // ---- main loop ----
  let startIdx = stages.indexOf(currentStage(await readEvents(dir)));
  if (startIdx < 0) startIdx = 0;
  let seatCursor = 0;

  try {
    for (let idx = startIdx; idx < stages.length; idx++) {
      const stage = stages[idx]!;
      for (;;) {
        if (opts.signal?.aborted) {
          await emit({ ts: ts(), type: "control", action: "stop", by: "system", detail: "aborted" });
          return { converged: false, stagesCompleted: completed, stoppedReason: "aborted", notes };
        }
        const events = await readEvents(dir);
        if (turnInStage(events) > config.budgets.maxTurnsPerStage) {
          await emit({ ts: ts(), type: "control", action: "pause", by: "system", detail: `stage ${stage} hit turn budget` });
          return { converged: false, stagesCompleted: completed, stoppedReason: "budget", notes };
        }
        const active = seatOrder();
        if (active.length < 2) {
          await emit({ ts: ts(), type: "control", action: "pause", by: "system", detail: "quorum lost (<2 active seats)" });
          return { converged: false, stagesCompleted: completed, stoppedReason: "needs_human", notes };
        }

        const seatId = active[seatCursor % active.length]!;
        seatCursor++;
        const turn = await runSeatTurn(seatId);
        if (turn.paused) continue;

        if (turn.move === "PROPOSE_CONVERGE") {
          if (await runConvergenceVote(seatId)) {
            await writeArtifact(stage, turn.content);
            await emit({ ts: ts(), type: "control", action: "converged", by: "system", detail: stage });
            completed.push(stage);
            const next = stages[idx + 1];
            if (next) await emit({ ts: ts(), type: "stage", from: stage, to: next, by: "models" });
            break;
          }
        } else if (turn.move === "PROPOSE_STAGE_ADVANCE" && config.stageMode === "models_decide") {
          const next = stages[idx + 1];
          if (next) {
            const ok = opts.confirmStageAdvance ? await opts.confirmStageAdvance(stage, next) : true;
            if (ok) {
              completed.push(stage);
              await emit({ ts: ts(), type: "stage", from: stage, to: next, by: "human" });
              break;
            }
          }
        }
      }
    }
  } catch (err) {
    if (isAbort(err)) {
      await emit({ ts: ts(), type: "control", action: "stop", by: "system", detail: "aborted" });
      return { converged: false, stagesCompleted: completed, stoppedReason: "aborted", notes };
    }
    throw err;
  }

  return {
    converged: completed.length === stages.length,
    stagesCompleted: completed,
    stoppedReason: "converged",
    notes,
  };
}

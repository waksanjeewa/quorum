import { z } from "zod";
import { MoveSchema, type Role, type SeatId, type Stage } from "./primitives.js";
import { type TranscriptEvent, UsageSchema } from "./transcript.js";

/**
 * Everything a seat sees on its turn, assembled by the ledger (SPEC §4).
 * Nothing here lives only in memory — it is all reconstructible from the session dir.
 */
export interface TurnContext {
  seat: SeatId;
  role: Role;
  stage: Stage;
  /** 1-based index of this turn within the current stage (drives anti-sycophancy gates). */
  turnInStage: number;
  goal: string;
  /** Rolling summary (summary.md); empty string before the first summary is written. */
  summary: string;
  /** Full transcript (contextMode "full") or the last N turns (contextMode "summary_tail"). */
  recentTurns: TranscriptEvent[];
  /** Human messages queued since the last turn; must be addressed this turn. */
  pendingInjections: string[];
  /** Role-specific system instructions for the seated model. */
  roleInstructions: string;
}

/**
 * Result of a single adapter turn (SPEC §5). `usage_limit` triggers the failover chain;
 * a non-retryable `error` does too, a retryable one is retried on the same model first.
 */
export const TurnResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    content: z.string(),
    move: MoveSchema.optional(),
    usage: UsageSchema.optional(),
  }),
  z.object({
    status: z.literal("usage_limit"),
    detail: z.string(),
    /** ISO time the limit resets, when the provider tells us. */
    resetsAt: z.string().datetime({ offset: true }).optional(),
  }),
  z.object({
    status: z.literal("error"),
    detail: z.string(),
    retryable: z.boolean(),
  }),
]);
export type TurnResult = z.infer<typeof TurnResultSchema>;

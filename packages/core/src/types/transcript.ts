import { z } from "zod";
import { MoveSchema, SeatIdSchema, StageSchema } from "./primitives.js";

/** Token/cost accounting for a single turn. All fields optional (not all providers report). */
export const UsageSchema = z.object({
  inputTokens: z.number().nonnegative().optional(),
  outputTokens: z.number().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
});
export type Usage = z.infer<typeof UsageSchema>;

const IsoTimestamp = z.string().datetime({ offset: true });

/**
 * The append-only transcript event log (DESIGN §4). One event per JSONL line.
 * This is the shared brain: any model can be handed the tail to pick up a seat.
 */
export const TranscriptEventSchema = z.discriminatedUnion("type", [
  z.object({
    ts: IsoTimestamp,
    type: z.literal("turn"),
    seat: SeatIdSchema,
    model: z.string(),
    content: z.string(),
    move: MoveSchema.optional(),
    usage: UsageSchema.optional(),
  }),
  z.object({
    ts: IsoTimestamp,
    type: z.literal("human"),
    content: z.string(),
  }),
  z.object({
    ts: IsoTimestamp,
    type: z.literal("seat_change"),
    seat: SeatIdSchema,
    from: z.string(),
    to: z.string(),
    reason: z.enum(["usage_limit", "error", "manual"]),
  }),
  z.object({
    ts: IsoTimestamp,
    type: z.literal("stage"),
    from: StageSchema,
    to: StageSchema,
    by: z.enum(["models", "human"]),
  }),
  z.object({
    ts: IsoTimestamp,
    type: z.literal("control"),
    action: z.enum(["pause", "resume", "stop", "converged"]),
    by: z.enum(["human", "system"]),
    detail: z.string().optional(),
  }),
  // ---- Phase 2 (the Workshop) execution events ----
  z.object({
    ts: IsoTimestamp,
    type: z.literal("task_start"),
    task: z.string(),
    seat: SeatIdSchema,
    model: z.string(),
    worktree: z.string(),
  }),
  z.object({
    ts: IsoTimestamp,
    type: z.literal("task_result"),
    task: z.string(),
    passed: z.boolean(),
    detail: z.string().optional(),
  }),
  z.object({
    ts: IsoTimestamp,
    type: z.literal("merge"),
    task: z.string(),
    result: z.enum(["merged", "conflict", "blocked"]),
    detail: z.string().optional(),
  }),
]);
export type TranscriptEvent = z.infer<typeof TranscriptEventSchema>;

/** Narrow a parsed event to a specific `type` for exhaustive handling. */
export type TranscriptEventOf<T extends TranscriptEvent["type"]> = Extract<
  TranscriptEvent,
  { type: T }
>;

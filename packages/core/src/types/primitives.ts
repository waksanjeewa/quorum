import { z } from "zod";

/** Pipeline stages. Deliberation stages are task-agnostic; execute is task-specific. */
export const StageSchema = z.enum(["brainstorm", "plan", "execute", "review"]);
export type Stage = z.infer<typeof StageSchema>;

/** A seat's role in the roundtable. See DESIGN §6. */
export const RoleSchema = z.enum(["proposer", "critic", "arbiter"]);
export type Role = z.infer<typeof RoleSchema>;

/**
 * Structured moves a seat can make at the end of a turn (DESIGN §6).
 * Parsed from a fenced `move:` block in the model's response; absence = plain turn.
 */
export const MoveSchema = z.enum([
  "PROPOSE_CONVERGE",
  "APPROVE",
  "BLOCK",
  "PROPOSE_STAGE_ADVANCE",
]);
export type Move = z.infer<typeof MoveSchema>;

/** Identifier for a seat at the table, e.g. "proposer", "critic", "arbiter". */
export const SeatIdSchema = z.string().min(1);
export type SeatId = z.infer<typeof SeatIdSchema>;

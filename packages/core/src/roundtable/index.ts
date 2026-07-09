// Roundtable engine (SPEC §6 / DESIGN §6) — the deliberation loop.
export { parseMove } from "./moves.js";
export { ROLE_PROMPTS, buildRoleInstructions, type RoleInstructionFn } from "./roles.js";
export {
  runRoundtable,
  parseDurationMs,
  type SeatRunner,
  type RunRoundtableOpts,
  type RoundtableResult,
  type StoppedReason,
} from "./engine.js";
export {
  runExecuteStage,
  type RunExecuteOpts,
  type ExecuteResult,
  type ExecutorFactory,
  type ReviewFn,
} from "./execute.js";
export { decomposePlan, parseTasksJson, type DecomposeOpts } from "./decompose.js";

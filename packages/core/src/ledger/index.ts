// Ledger — all disk IO for a session (SPEC §4). The source of truth lives here.
export { sessionsRoot, sessionDir, sessionFiles, makeSessionId } from "./paths.js";
export {
  createSession,
  openSession,
  readGoal,
  readSummary,
  writeSummary,
  type Session,
  type CreateSessionOpts,
} from "./session.js";
export { appendEvent, readEvents, type ReadEventsOpts } from "./transcript.js";
export {
  buildTurnContext,
  currentStage,
  turnInStage,
  pendingInjections,
  type BuildTurnContextOpts,
} from "./context.js";
export {
  parseTaskFile,
  serializeTaskFile,
  readTask,
  writeTask,
  readTasks,
  updateTaskStatus,
  TaskStatusSchema,
  TaskFrontmatterSchema,
  type TaskStatus,
  type TaskFrontmatter,
  type TaskFile,
} from "./tasks.js";

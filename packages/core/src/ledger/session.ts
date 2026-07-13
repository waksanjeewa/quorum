import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseSessionConfig, type SessionConfig } from "../types/index.js";
import { makeSessionId, sessionDir, sessionFiles } from "./paths.js";

/** A live handle to a session on disk. Everything needed to resume is under `dir`. */
export interface Session {
  id: string;
  dir: string;
  config: SessionConfig;
  /** The user's original goal (from goal.md). */
  goal: string;
}

export interface CreateSessionOpts {
  /** Injected clock (keeps ids deterministic in tests). Defaults to now. */
  now?: Date;
}

/**
 * Create a new session directory (SPEC §4): writes goal.md, snapshots the resolved config,
 * and makes tasks/ and artifacts/ subdirs. Idempotent mkdir (recursive).
 */
export async function createSession(
  projectRoot: string,
  goal: string,
  config: SessionConfig,
  opts: CreateSessionOpts = {},
): Promise<Session> {
  const now = opts.now ?? new Date();
  const id = makeSessionId(now, goal);
  const dir = sessionDir(projectRoot, id);
  await mkdir(sessionFiles.tasksDir(dir), { recursive: true });
  await mkdir(sessionFiles.artifactsDir(dir), { recursive: true });
  await writeFile(sessionFiles.goal(dir), goal.trim() + "\n", "utf8");
  await writeFile(sessionFiles.configSnapshot(dir), JSON.stringify(config, null, 2), "utf8");
  return { id, dir, config, goal: goal.trim() };
}

/**
 * Re-open an existing session from disk (SPEC §1: reconstructible from the session dir alone).
 * Reads the config snapshot written at creation so a resumed run uses the same settings.
 */
export async function openSession(projectRoot: string, id: string): Promise<Session> {
  const dir = sessionDir(projectRoot, id);
  const snapshot = await readFile(sessionFiles.configSnapshot(dir), "utf8");
  const config = parseSessionConfig(JSON.parse(snapshot));
  const goal = await readGoal(dir).catch(() => "");
  return { id, dir, config, goal };
}

/** Read the session goal (goal.md). */
export async function readGoal(dir: string): Promise<string> {
  return (await readFile(sessionFiles.goal(dir), "utf8")).trim();
}

/** Read the rolling summary (summary.md), or "" if none has been written yet. */
export async function readSummary(dir: string): Promise<string> {
  try {
    return (await readFile(sessionFiles.summary(dir), "utf8")).trim();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

/** Overwrite the rolling summary (summary.md). Maintained by task 070. */
export async function writeSummary(dir: string, summary: string): Promise<void> {
  await writeFile(sessionFiles.summary(dir), summary.trim() + "\n", "utf8");
}

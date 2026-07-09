import { join } from "node:path";

/** Filesystem layout of a session directory (DESIGN §4). One place owns these paths. */
export function sessionsRoot(projectRoot: string): string {
  return join(projectRoot, ".quorum", "sessions");
}

export function sessionDir(projectRoot: string, id: string): string {
  return join(sessionsRoot(projectRoot), id);
}

export const sessionFiles = {
  goal: (dir: string) => join(dir, "goal.md"),
  transcript: (dir: string) => join(dir, "transcript.jsonl"),
  summary: (dir: string) => join(dir, "summary.md"),
  spec: (dir: string) => join(dir, "spec.md"),
  configSnapshot: (dir: string) => join(dir, "config.snapshot.json"),
  tasksDir: (dir: string) => join(dir, "tasks"),
  artifactsDir: (dir: string) => join(dir, "artifacts"),
} as const;

/**
 * Build a session id from a date and goal, e.g. "2026-07-06-payment-api".
 * `date` is injected (not read from the clock here) so callers stay testable.
 */
export function makeSessionId(date: Date, goal: string): string {
  const day = date.toISOString().slice(0, 10);
  const slug =
    goal
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "session";
  return `${day}-${slug}`;
}

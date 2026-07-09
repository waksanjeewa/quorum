import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { sessionFiles } from "./paths.js";

/** Frontmatter of a runtime task file in a session's tasks/ dir (DESIGN §4). */
export const TaskStatusSchema = z.enum(["todo", "in_progress", "review", "done", "blocked"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskFrontmatterSchema = z.object({
  id: z.coerce.string(),
  title: z.string(),
  status: TaskStatusSchema,
  owner_seat: z.string().nullable().optional(),
  owned_paths: z.array(z.string()).default([]),
  acceptance: z.array(z.string()).default([]),
});
export type TaskFrontmatter = z.infer<typeof TaskFrontmatterSchema>;

export interface TaskFile {
  frontmatter: TaskFrontmatter;
  /** Everything after the closing `---`, verbatim (the journal + notes). */
  body: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/** Split a task markdown file into validated frontmatter + raw body. Throws on invalid frontmatter. */
export function parseTaskFile(raw: string): TaskFile {
  const m = FRONTMATTER_RE.exec(raw);
  if (!m) throw new Error("task file missing YAML frontmatter (--- … ---)");
  const frontmatter = TaskFrontmatterSchema.parse(parseYaml(m[1]!));
  return { frontmatter, body: m[2] ?? "" };
}

/** Serialize a task file (used when the plan stage writes new tasks). */
export function serializeTaskFile(task: TaskFile): string {
  const fm = stringifyYaml(task.frontmatter).trimEnd();
  const body = task.body.replace(/^\n+/, "");
  return `---\n${fm}\n---\n${body ? "\n" + body : "\n"}`;
}

export async function readTask(path: string): Promise<TaskFile> {
  return parseTaskFile(await readFile(path, "utf8"));
}

export async function writeTask(path: string, task: TaskFile): Promise<void> {
  await writeFile(path, serializeTaskFile(task), "utf8");
}

/** Read every *.md task in a session's tasks/ dir, sorted by id. */
export async function readTasks(sessionDirPath: string): Promise<TaskFile[]> {
  const tasksDir = sessionFiles.tasksDir(sessionDirPath);
  let names: string[];
  try {
    names = await readdir(tasksDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const files = await Promise.all(
    names.filter((n) => n.endsWith(".md")).map((n) => readTask(join(tasksDir, n))),
  );
  return files.sort((a, b) => a.frontmatter.id.localeCompare(b.frontmatter.id, undefined, { numeric: true }));
}

/**
 * Update only the `status:` line in place, leaving the rest of the file byte-for-byte identical.
 * Used for the hot path (todo → in_progress → done) so journals never churn. Returns the new text.
 */
export async function updateTaskStatus(path: string, status: TaskStatus): Promise<void> {
  const raw = await readFile(path, "utf8");
  const m = FRONTMATTER_RE.exec(raw);
  if (!m) throw new Error("task file missing YAML frontmatter");
  const fmStart = raw.indexOf("\n") + 1; // after the opening ---
  const fmEnd = raw.indexOf("\n---", fmStart); // start of closing ---
  const head = raw.slice(0, fmStart);
  const fm = raw.slice(fmStart, fmEnd);
  const tail = raw.slice(fmEnd);
  const nextFm = fm.replace(/^(status:[ \t]*).*$/m, `$1${status}`);
  if (nextFm === fm && !/^status:/m.test(fm)) throw new Error("no status field to update");
  await writeFile(path, head + nextFm + tail, "utf8");
}

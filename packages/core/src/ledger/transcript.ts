import { appendFile, readFile } from "node:fs/promises";
import { TranscriptEventSchema, type TranscriptEvent } from "../types/index.js";
import { sessionFiles } from "./paths.js";

/**
 * Append one validated event to transcript.jsonl (SPEC §4). Atomic single-line append:
 * one appendFile call writing `JSON.stringify(event)\n`. Never rewrites the file.
 * The event is schema-validated first, so only well-formed lines ever hit disk.
 */
export async function appendEvent(dir: string, event: TranscriptEvent): Promise<void> {
  const parsed = TranscriptEventSchema.parse(event);
  await appendFile(sessionFiles.transcript(dir), JSON.stringify(parsed) + "\n", "utf8");
}

export interface ReadEventsOpts {
  /** Called for each line that fails to parse (corrupt or a torn trailing line after a crash). */
  onSkip?: (line: string, reason: string) => void;
}

/**
 * Read all valid events from transcript.jsonl (SPEC §4). Tolerant by design:
 * corrupt lines and a partial trailing line (mid-write crash) are skipped and reported,
 * never thrown. A missing file yields an empty list.
 */
export async function readEvents(dir: string, opts: ReadEventsOpts = {}): Promise<TranscriptEvent[]> {
  let raw: string;
  try {
    raw = await readFile(sessionFiles.transcript(dir), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const events: TranscriptEvent[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      opts.onSkip?.(line, "invalid JSON");
      continue;
    }
    const result = TranscriptEventSchema.safeParse(json);
    if (!result.success) {
      opts.onSkip?.(line, result.error.issues.map((i) => i.message).join("; "));
      continue;
    }
    events.push(result.data);
  }
  return events;
}

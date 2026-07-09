import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSessionConfig, type SessionConfig, type TranscriptEvent } from "../types/index.js";
import {
  appendEvent,
  buildTurnContext,
  createSession,
  openSession,
  readEvents,
  readTasks,
  sessionFiles,
  updateTaskStatus,
  writeSummary,
  writeTask,
} from "./index.js";

const CONFIG: SessionConfig = parseSessionConfig({
  seats: { proposer: { chain: ["ollama/llama3"] }, critic: { chain: ["ollama/llama3"] } },
});

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "quorum-ledger-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const at = (n: number) => `2026-07-06T10:0${n}:00.000Z`;

describe("createSession / openSession", () => {
  it("creates the directory layout and round-trips config", async () => {
    const s = await createSession(root, "Payment API", CONFIG, { now: new Date("2026-07-06T00:00:00Z") });
    expect(s.id).toBe("2026-07-06-payment-api");
    expect((await readFile(sessionFiles.goal(s.dir), "utf8")).trim()).toBe("Payment API");
    const reopened = await openSession(root, s.id);
    expect(reopened.config).toEqual(CONFIG);
    expect(Object.keys(reopened.config.seats)).toEqual(["proposer", "critic"]);
  });
});

describe("transcript append/read", () => {
  it("appends and reads events in order", async () => {
    const s = await createSession(root, "goal", CONFIG);
    const events: TranscriptEvent[] = [
      { ts: at(1), type: "stage", from: "brainstorm", to: "brainstorm", by: "human" },
      { ts: at(2), type: "turn", seat: "proposer", model: "m", content: "idea" },
      { ts: at(3), type: "human", content: "prefer EU" },
    ];
    for (const e of events) await appendEvent(s.dir, e);
    const read = await readEvents(s.dir);
    expect(read).toEqual(events);
  });

  it("returns [] for a session with no transcript yet", async () => {
    const s = await createSession(root, "goal", CONFIG);
    expect(await readEvents(s.dir)).toEqual([]);
  });

  it("skips corrupt lines and a torn trailing line without throwing (crash recovery)", async () => {
    const s = await createSession(root, "goal", CONFIG);
    await appendEvent(s.dir, { ts: at(1), type: "human", content: "good one" });
    // simulate a mid-write crash: a garbage line and a truncated JSON line with no newline
    await appendFile(sessionFiles.transcript(s.dir), "not json at all\n", "utf8");
    await appendFile(sessionFiles.transcript(s.dir), '{"ts":"2026-07-06T10:05:00.000Z","type":"tur', "utf8");
    const skipped: string[] = [];
    const events = await readEvents(s.dir, { onSkip: (line) => skipped.push(line) });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "human", content: "good one" });
    expect(skipped).toHaveLength(2);
  });

  it("rejects an invalid event before it reaches disk", async () => {
    const s = await createSession(root, "goal", CONFIG);
    // @ts-expect-error deliberately malformed
    await expect(appendEvent(s.dir, { ts: at(1), type: "turn" })).rejects.toThrow();
  });
});

describe("buildTurnContext", () => {
  it("derives stage, turn index, pending injections and honors summary_tail", async () => {
    const s = await createSession(root, "Build a CLI", CONFIG);
    await writeSummary(s.dir, "Decided: TypeScript.");
    await appendEvent(s.dir, { ts: at(1), type: "turn", seat: "proposer", model: "m", content: "t1" });
    await appendEvent(s.dir, { ts: at(2), type: "stage", from: "brainstorm", to: "plan", by: "models" });
    await appendEvent(s.dir, { ts: at(3), type: "turn", seat: "proposer", model: "m", content: "t2" });
    await appendEvent(s.dir, { ts: at(4), type: "human", content: "add tests" });
    await appendEvent(s.dir, { ts: at(5), type: "human", content: "and docs" });

    const ctx = await buildTurnContext(s.dir, {
      seat: "critic",
      role: "critic",
      roleInstructions: "Find weaknesses.",
      tailSize: 3,
    });
    expect(ctx.goal).toBe("Build a CLI");
    expect(ctx.summary).toBe("Decided: TypeScript.");
    expect(ctx.stage).toBe("plan");
    expect(ctx.turnInStage).toBe(2); // one turn since stage→plan, next is #2
    expect(ctx.pendingInjections).toEqual(["add tests", "and docs"]);
    expect(ctx.recentTurns).toHaveLength(3); // tailSize
    expect(ctx.roleInstructions).toBe("Find weaknesses.");
  });

  it("full mode returns the entire transcript", async () => {
    const s = await createSession(root, "goal", CONFIG);
    for (let i = 1; i <= 5; i++)
      await appendEvent(s.dir, { ts: at(i), type: "turn", seat: "proposer", model: "m", content: `t${i}` });
    const ctx = await buildTurnContext(s.dir, {
      seat: "proposer",
      role: "proposer",
      roleInstructions: "",
      contextMode: "full",
    });
    expect(ctx.recentTurns).toHaveLength(5);
  });
});

describe("task files", () => {
  const TASK = `---
id: "001"
title: Design schema
status: todo
owner_seat: null
owned_paths:
  - db/
acceptance:
  - migrations run cleanly
---

## Journal
- created
`;

  it("reads tasks and updates status byte-stably", async () => {
    const s = await createSession(root, "goal", CONFIG);
    const path = join(sessionFiles.tasksDir(s.dir), "001-schema.md");
    await writeFile(path, TASK, "utf8");

    const before = await readFile(path, "utf8");
    await updateTaskStatus(path, "in_progress");
    const after = await readFile(path, "utf8");

    // only the status line changed; journal + everything else identical
    expect(after).toBe(before.replace("status: todo", "status: in_progress"));

    const tasks = await readTasks(s.dir);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.frontmatter.status).toBe("in_progress");
    expect(tasks[0]?.frontmatter.owned_paths).toEqual(["db/"]);
    expect(tasks[0]?.body).toContain("## Journal");
  });

  it("serializes a new task and reads it back", async () => {
    const s = await createSession(root, "goal", CONFIG);
    const path = join(sessionFiles.tasksDir(s.dir), "002-api.md");
    await writeTask(path, {
      frontmatter: {
        id: "002",
        title: "Build API",
        status: "todo",
        owned_paths: ["api/"],
        acceptance: ["endpoints respond"],
      },
      body: "## Journal\n- (empty)\n",
    });
    const [round] = await readTasks(s.dir);
    expect(round?.frontmatter.title).toBe("Build API");
    expect(round?.frontmatter.acceptance).toEqual(["endpoints respond"]);
  });
});

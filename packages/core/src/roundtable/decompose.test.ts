import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSessionConfig } from "../types/index.js";
import { createSession, readTasks, sessionFiles } from "../ledger/index.js";
import type { SeatRunner } from "./engine.js";
import { decomposePlan, parseTasksJson } from "./decompose.js";

const CONFIG = parseSessionConfig({ seats: { proposer: { chain: ["x"] }, critic: { chain: ["x"] } } });

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "quorum-dec-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("parseTasksJson", () => {
  it("extracts a JSON array even with surrounding prose / code fences", () => {
    const text = 'Here are the tasks:\n```json\n[{"title":"A","acceptance":["pnpm test"],"owned_paths":["a/"]}]\n```\nDone.';
    expect(parseTasksJson(text)).toEqual([{ title: "A", acceptance: ["pnpm test"], owned_paths: ["a/"] }]);
  });
  it("returns [] on garbage and drops entries with no title", () => {
    expect(parseTasksJson("no json here")).toEqual([]);
    expect(parseTasksJson('[{"acceptance":["x"]}]')).toEqual([]);
  });
});

describe("decomposePlan", () => {
  it("turns spec.md into runtime task files with $-prefixed acceptance", async () => {
    const session = await createSession(root, "build a thing", CONFIG);
    await writeFile(sessionFiles.spec(session.dir), "Plan: build module A and B.", "utf8");
    const planner: SeatRunner = {
      id: "planner",
      async takeTurn() {
        return {
          status: "ok",
          content: '[{"title":"Build A","acceptance":["node a.js"],"owned_paths":["a.js"]},{"title":"Build B","acceptance":[],"owned_paths":[]}]',
        };
      },
    };

    const created = await decomposePlan({ session, planner });
    expect(created).toHaveLength(2);
    const tasks = await readTasks(session.dir);
    expect(tasks.map((t) => t.frontmatter.id)).toEqual(["001", "002"]);
    expect(tasks[0]?.frontmatter.title).toBe("Build A");
    expect(tasks[0]?.frontmatter.acceptance).toEqual(["$ node a.js"]); // command prefixed
    expect(tasks[1]?.frontmatter.acceptance).toEqual([]); // no command → review-only
  });
});

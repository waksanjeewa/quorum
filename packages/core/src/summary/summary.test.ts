import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSessionConfig } from "../types/index.js";
import { appendEvent, buildTurnContext, createSession, readSummary } from "../ledger/index.js";
import type { SeatRunner } from "../roundtable/engine.js";
import { SummaryMaintainer } from "./summary.js";

const CONFIG = parseSessionConfig({
  seats: { proposer: { chain: ["m"] }, critic: { chain: ["m"] } },
});

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "quorum-summary-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A cheap summarizer that emits a structured summary capturing the stage + a decision. */
const summarizer: SeatRunner = {
  id: "cheap-free-model",
  async takeTurn(ctx) {
    const turns = ctx.recentTurns.filter((e) => e.type === "turn").length;
    return {
      status: "ok",
      content:
        `## Decisions so far\n- Chose TypeScript for the stack.\n` +
        `## Open threads\n- Naming.\n` +
        `## Current focus\nstage=plan; ${turns} turns so far.`,
    };
  },
};

async function addTurns(dir: string, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await appendEvent(dir, {
      ts: `2026-07-06T10:0${i}:00.000Z`,
      type: "turn",
      seat: "proposer",
      model: "m",
      content: `turn ${i}`,
    });
  }
}

describe("SummaryMaintainer", () => {
  it("updates only after K turns", async () => {
    const s = await createSession(root, "goal", CONFIG);
    const sm = new SummaryMaintainer(s.dir, summarizer, { everyK: 3 });

    await addTurns(s.dir, 2);
    expect(await sm.maybeUpdate()).toBe(false); // below K
    expect(await readSummary(s.dir)).toBe("");

    await addTurns(s.dir, 1); // now 3
    expect(await sm.maybeUpdate()).toBe(true);
    expect(await readSummary(s.dir)).toContain("Decisions so far");

    // no new turns → no further update
    expect(await sm.maybeUpdate()).toBe(false);
  });

  it("writes a summary a fresh model can read to recover stage + decisions from summary+tail alone", async () => {
    const s = await createSession(root, "Build a CLI", CONFIG);
    await addTurns(s.dir, 3);
    const sm = new SummaryMaintainer(s.dir, summarizer, { everyK: 3 });
    await sm.maybeUpdate();

    // simulate a takeover: give a model ONLY goal + summary + last 3 turns
    const ctx = await buildTurnContext(s.dir, {
      seat: "critic",
      role: "critic",
      roleInstructions: "",
      contextMode: "summary_tail",
      tailSize: 3,
    });
    expect(ctx.summary).toContain("stage=plan");
    expect(ctx.summary).toContain("TypeScript");
    expect(ctx.recentTurns).toHaveLength(3);
  });
});

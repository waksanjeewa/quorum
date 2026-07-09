import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendEvent,
  createSession,
  parseSessionConfig,
  readEvents,
  runRoundtable,
  sessionFiles,
  type SessionConfig,
  type TranscriptEvent,
} from "@quorum/core";
import { MockAdapter } from "./mock/mock-adapter.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "quorum-engine-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Deterministic monotonic clock for event timestamps. */
function clock(): () => Date {
  let t = 0;
  return () => new Date(Date.UTC(2026, 6, 6, 10, 0, 0) + t++ * 1000);
}

function cfg(overrides: Record<string, unknown> = {}, seats?: Record<string, unknown>): SessionConfig {
  return parseSessionConfig({
    seats: seats ?? {
      proposer: { chain: ["mock"] },
      critic: { chain: ["mock"] },
      arbiter: { chain: ["mock"] },
    },
    budgets: { max_turns_per_stage: 20 },
    ...overrides,
  });
}

/** A proposer that deliberates, then calls convergence once the stage has enough turns. */
const convergingProposer = () =>
  new MockAdapter({
    id: "proposer",
    script: Array.from({ length: 30 }, () => (ctx: import("@quorum/core").TurnContext) =>
      ctx.turnInStage >= 4
        ? { status: "ok" as const, content: `Final draft for ${ctx.stage}.\nmove: PROPOSE_CONVERGE` }
        : { status: "ok" as const, content: `${ctx.stage} idea @${ctx.turnInStage}` },
    ),
  });
/** A seat that approves once it's allowed to (turn ≥ 3). */
const approver = (id: string) =>
  new MockAdapter({
    id,
    script: Array.from({ length: 30 }, () => (ctx: import("@quorum/core").TurnContext) =>
      ctx.turnInStage >= 3
        ? { status: "ok" as const, content: "No further objections.\nmove: APPROVE" }
        : { status: "ok" as const, content: `considering @${ctx.turnInStage}` },
    ),
  });

describe("runRoundtable — convergence happy path", () => {
  it("runs brainstorm → plan, writes both artifacts, converges", async () => {
    const config = cfg();
    const session = await createSession(root, "Plan a birthday party", config);
    const result = await runRoundtable({
      session,
      seats: { proposer: convergingProposer(), critic: approver("critic"), arbiter: approver("arbiter") },
      now: clock(),
    });

    expect(result.converged).toBe(true);
    expect(result.stagesCompleted).toEqual(["brainstorm", "plan"]);
    expect(result.stoppedReason).toBe("converged");

    const ideas = await readFile(join(sessionFiles.artifactsDir(session.dir), "ideas.md"), "utf8");
    const spec = await readFile(sessionFiles.spec(session.dir), "utf8");
    expect(ideas).toContain("Final draft for brainstorm");
    expect(spec).toContain("Final draft for plan");
    expect(ideas).not.toContain("move:"); // move line stripped from artifact

    const events = await readEvents(session.dir);
    const converged = events.filter((e) => e.type === "control" && e.action === "converged");
    expect(converged).toHaveLength(2);
    expect(events.some((e) => e.type === "stage" && e.to === "plan")).toBe(true);
    // turns carry model id + content
    const turn = events.find((e) => e.type === "turn");
    expect(turn).toMatchObject({ model: expect.any(String), content: expect.any(String) });
  });
});

describe("runRoundtable — anti-sycophancy", () => {
  it("rejects a critic's APPROVE before turn 3, then converges once it's legitimate", async () => {
    // 2 seats; proposer proposes immediately so the critic's first vote lands at turn 2 (< 3).
    const config = cfg({ budgets: { max_turns_per_stage: 20 } }, {
      proposer: { chain: ["mock"] },
      critic: { chain: ["mock"] },
    });
    const session = await createSession(root, "quick decision", config);

    const proposer = new MockAdapter({
      id: "proposer",
      script: Array.from({ length: 30 }, () => () => ({
        status: "ok" as const,
        content: "Draft.\nmove: PROPOSE_CONVERGE",
      })),
    });
    const eagerCritic = new MockAdapter({
      id: "critic",
      script: Array.from({ length: 30 }, () => () => ({
        status: "ok" as const,
        content: "Sounds great!\nmove: APPROVE",
      })),
    });

    const result = await runRoundtable({
      session,
      seats: { proposer, critic: eagerCritic },
      stages: ["brainstorm"],
      now: clock(),
    });

    expect(result.converged).toBe(true);
    // the early approval was rejected at least once before convergence
    expect(result.notes.some((n) => n.includes("rejected early APPROVE"))).toBe(true);
  });
});

describe("runRoundtable — model-requested stage advance", () => {
  it("asks for human confirmation and advances only when confirmed", async () => {
    const config = cfg(); // stageMode defaults to models_decide
    const session = await createSession(root, "advance me", config);

    const confirmCalls: Array<[string, string]> = [];
    const result = await runRoundtable({
      session,
      seats: {
        proposer: new MockAdapter({
          id: "proposer",
          script: [
            () => ({ status: "ok", content: "Move on.\nmove: PROPOSE_STAGE_ADVANCE" }),
            ...Array.from({ length: 30 }, () => (ctx: import("@quorum/core").TurnContext) =>
              ctx.turnInStage >= 4
                ? { status: "ok" as const, content: "Final plan.\nmove: PROPOSE_CONVERGE" }
                : { status: "ok" as const, content: `plan @${ctx.turnInStage}` },
            ),
          ],
        }),
        critic: approver("critic"),
        arbiter: approver("arbiter"),
      },
      now: clock(),
      confirmStageAdvance: async (from, to) => {
        confirmCalls.push([from, to]);
        return true;
      },
    });

    expect(confirmCalls[0]).toEqual(["brainstorm", "plan"]);
    const events = await readEvents(session.dir);
    expect(events.some((e) => e.type === "stage" && e.to === "plan" && e.by === "human")).toBe(true);
    expect(result.stagesCompleted).toContain("brainstorm");
  });
});

describe("runRoundtable — failover", () => {
  it("swaps a usage-limited seat and continues to convergence", async () => {
    const config = cfg();
    const session = await createSession(root, "resilient run", config);

    const limited = new MockAdapter({ id: "proposer-primary", script: [{ status: "usage_limit", detail: "5-hour limit reached" }] });
    let failedOver = false;
    const result = await runRoundtable({
      session,
      seats: { proposer: limited, critic: approver("critic"), arbiter: approver("arbiter") },
      now: clock(),
      failover: async (seatId) => {
        if (seatId === "proposer" && !failedOver) {
          failedOver = true;
          const backup = convergingProposer();
          return backup;
        }
        return null;
      },
    });

    expect(result.converged).toBe(true);
    const events = await readEvents(session.dir);
    const change = events.find((e) => e.type === "seat_change");
    expect(change).toMatchObject({ seat: "proposer", from: "proposer-primary", reason: "usage_limit" });
  });
});

describe("runRoundtable — kill switch", () => {
  it("stops promptly when the signal aborts mid-turn", async () => {
    const config = cfg();
    const session = await createSession(root, "stoppable", config);
    const ctrl = new AbortController();
    const hanging = new MockAdapter({ id: "proposer", script: [{ kind: "hang" }] });

    const p = runRoundtable({
      session,
      seats: { proposer: hanging, critic: approver("critic"), arbiter: approver("arbiter") },
      now: clock(),
      signal: ctrl.signal,
    });
    setTimeout(() => ctrl.abort(), 20);
    const result = await p;

    expect(result.stoppedReason).toBe("aborted");
    const events = await readEvents(session.dir);
    expect(events.some((e) => e.type === "control" && e.action === "stop")).toBe(true);
  });
});

describe("runRoundtable — budget", () => {
  it("pauses and asks the human when a stage exhausts its turn budget", async () => {
    const config = cfg({ budgets: { max_turns_per_stage: 3 } });
    const session = await createSession(root, "endless debate", config);
    const chatter = (id: string) =>
      new MockAdapter({ id, script: Array.from({ length: 30 }, () => ({ status: "ok" as const, content: "still thinking" })) });

    const result = await runRoundtable({
      session,
      seats: { proposer: chatter("proposer"), critic: chatter("critic"), arbiter: chatter("arbiter") },
      stages: ["brainstorm"],
      now: clock(),
    });

    expect(result.converged).toBe(false);
    expect(result.stoppedReason).toBe("budget");
    const events = await readEvents(session.dir);
    expect(events.some((e) => e.type === "control" && e.action === "pause")).toBe(true);
  });
});

describe("runRoundtable — human injection", () => {
  it("surfaces a queued human message to the next seat's context", async () => {
    const config = cfg({ budgets: { max_turns_per_stage: 1 } }, {
      proposer: { chain: ["mock"] },
      critic: { chain: ["mock"] },
    });
    const session = await createSession(root, "injectable", config);
    await appendEvent(session.dir, {
      ts: "2026-07-06T09:00:00.000Z",
      type: "human",
      content: "focus on the EU market first",
    } satisfies TranscriptEvent);

    const captured: string[][] = [];
    const proposer = new MockAdapter({
      id: "proposer",
      script: [
        (ctx) => {
          captured.push([...ctx.pendingInjections]);
          return { status: "ok", content: "noted" };
        },
      ],
    });

    await runRoundtable({
      session,
      seats: { proposer, critic: approver("critic") },
      stages: ["brainstorm"],
      now: clock(),
    });

    expect(captured[0]).toContain("focus on the EU market first");
  });
});

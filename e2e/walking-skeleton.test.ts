import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSession, parseSessionConfig, readEvents, sessionFiles, type TurnContext } from "@quorum/core";
import { MockAdapter, type AdapterRegistry } from "@quorum/adapters";
import { QuorumHttpServer } from "@quorum/daemon";

/**
 * The Phase-1 Definition of Done (SPEC §9): a full-stack run — daemon + engine + adapters + ledger
 * — driven exactly as `quorum start` drives it, but with MockAdapters so it's deterministic and
 * costs no tokens.
 */

let root: string;
let server: QuorumHttpServer;
let base: string;
let token: string;

const THREE_SEATS = parseSessionConfig({
  seats: { proposer: { chain: ["pm"] }, critic: { chain: ["cm"] }, arbiter: { chain: ["am"] } },
  budgets: { max_turns_per_stage: 30 },
});

const proposerFn = (convergeAt: number) => (ctx: TurnContext) => {
  const addressing = ctx.pendingInjections.length ? `Addressing: ${ctx.pendingInjections.join("; ")}\n` : "";
  return ctx.turnInStage >= convergeAt
    ? { status: "ok" as const, content: `${addressing}Final ${ctx.stage} plan.\nmove: PROPOSE_CONVERGE` }
    : { status: "ok" as const, content: `${addressing}${ctx.stage} idea @${ctx.turnInStage}` };
};
const approverFn = (ctx: TurnContext) => {
  const addressing = ctx.pendingInjections.length ? `Addressing: ${ctx.pendingInjections.join("; ")}\n` : "";
  return ctx.turnInStage >= 3
    ? { status: "ok" as const, content: `${addressing}Agreed.\nmove: APPROVE` }
    : { status: "ok" as const, content: `${addressing}considering` };
};

function seat(id: string, fn: (ctx: TurnContext) => { status: "ok"; content: string }): MockAdapter {
  return new MockAdapter({ id, script: Array.from({ length: 60 }, () => fn) });
}

async function api(path: string, method = "GET", body?: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function boot(registryFactory: () => { registry: AdapterRegistry }, stages?: string[]): Promise<void> {
  server = new QuorumHttpServer({
    projectRoot: root,
    registryFactory,
    ...(stages ? { stages: stages as never } : {}),
    renderDashboard: (t) => `<html>token=${t}</html>`,
  });
  const info = await server.listen();
  base = info.url;
  token = info.token;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "quorum-e2e-"));
});
afterEach(async () => {
  await server?.close();
  await rm(root, { recursive: true, force: true });
});

describe("Quorum walking skeleton (Phase 1 DoD)", () => {
  it("runs brainstorm→plan to convergence and writes non-trivial artifacts", async () => {
    await boot(() => ({
      registry: { get: (id) => ({ pm: seat("pm", proposerFn(4)), cm: seat("cm", approverFn), am: seat("am", approverFn) })[id] },
    }));

    const created = await (await api("/sessions", "POST", { goal: "plan a birthday party", config: THREE_SEATS })).json();
    const result = await server.daemon.get(created.id)!.wait();

    expect(result?.converged).toBe(true);
    expect(result?.stagesCompleted).toEqual(["brainstorm", "plan"]);

    const dir = join(root, ".quorum", "sessions", created.id);
    const ideas = await readFile(join(sessionFiles.artifactsDir(dir), "ideas.md"), "utf8");
    const spec = await readFile(sessionFiles.spec(dir), "utf8");
    expect(ideas.trim().length).toBeGreaterThan(10);
    expect(spec).toContain("Final plan plan");
    // dashboard is reachable unauthenticated
    expect((await fetch(`${base}/`)).status).toBe(200);
  });

  it("a mid-run injection appears in the transcript and is addressed on the next turn", async () => {
    // Paced, never-converging seats that echo pending injections — so there is always a "next turn"
    // and the run is slow enough for the injection to land. We poll for the condition (no timing guess).
    const echo = (id: string): MockAdapter =>
      new MockAdapter({
        id,
        delayMs: 25,
        script: Array.from({ length: 200 }, () => (ctx: TurnContext) => ({
          status: "ok" as const,
          content: (ctx.pendingInjections.length ? `Addressing: ${ctx.pendingInjections.join("; ")}\n` : "") + "thinking",
        })),
      });
    await boot(() => ({ registry: { get: (id) => ({ pm: echo("pm"), cm: echo("cm") })[id] } }), ["brainstorm"]);
    const cfg = parseSessionConfig({ seats: { proposer: { chain: ["pm"] }, critic: { chain: ["cm"] } }, budgets: { max_turns_per_stage: 200 } });
    const created = await (await api("/sessions", "POST", { goal: "injectable", config: cfg })).json();

    await api(`/sessions/${created.id}/inject`, "POST", { content: "EU-MARKET-FIRST" });

    // Poll the transcript until a turn after the injection acknowledges it.
    const dir = join(root, ".quorum", "sessions", created.id);
    let addressed = false;
    for (let i = 0; i < 100 && !addressed; i++) {
      const events = await readEvents(dir);
      const humanIdx = events.findIndex((e) => e.type === "human" && e.content === "EU-MARKET-FIRST");
      addressed = humanIdx >= 0 && events.slice(humanIdx).some((e) => e.type === "turn" && e.content.includes("Addressing: EU-MARKET-FIRST"));
      if (!addressed) await new Promise((r) => setTimeout(r, 20));
    }
    await api(`/sessions/${created.id}/stop`, "POST");
    expect(addressed).toBe(true);
  });

  it("fails over a usage-limited seat mid-stage and still completes", async () => {
    const critic1 = new MockAdapter({ id: "c1", script: [{ status: "usage_limit", detail: "5-hour limit reached" }] });
    const critic2 = seat("c2", approverFn);
    await boot(() => ({
      registry: {
        get: (id) => ({ pm: seat("pm", proposerFn(4)), c1: critic1, c2: critic2, am: seat("am", approverFn) })[id],
      },
    }));
    const cfg = parseSessionConfig({
      seats: { proposer: { chain: ["pm"] }, critic: { chain: ["c1", "c2"] }, arbiter: { chain: ["am"] } },
      budgets: { max_turns_per_stage: 30 },
    });
    const created = await (await api("/sessions", "POST", { goal: "resilient", config: cfg })).json();
    const result = await server.daemon.get(created.id)!.wait();

    expect(result?.converged).toBe(true);
    const events = await readEvents(join(root, ".quorum", "sessions", created.id));
    const change = events.find((e) => e.type === "seat_change");
    expect(change).toMatchObject({ seat: "critic", from: "c1", to: "c2", reason: "usage_limit" });
  });

  it("STOP halts a hanging run within 6s and leaves the session resumable", async () => {
    await boot(
      () => ({ registry: { get: (id) => ({ pm: new MockAdapter({ id: "pm", script: [{ kind: "hang" }] }), cm: seat("cm", approverFn) })[id] } }),
      ["brainstorm"],
    );
    const cfg = parseSessionConfig({ seats: { proposer: { chain: ["pm"] }, critic: { chain: ["cm"] } } });
    const created = await (await api("/sessions", "POST", { goal: "stoppable", config: cfg })).json();

    const t0 = Date.now();
    const stopped = await (await api(`/sessions/${created.id}/stop`, "POST")).json();
    expect(Date.now() - t0).toBeLessThan(6000);
    expect(["stopped", "error"]).toContain(stopped.state);

    // resumable: the session dir + transcript survive and reopen
    const reopened = await openSession(root, created.id);
    expect(reopened.id).toBe(created.id);
    const events = await readEvents(reopened.dir);
    expect(events.some((e) => e.type === "control" && e.action === "stop")).toBe(true);
  });
});

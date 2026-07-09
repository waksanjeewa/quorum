import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSessionConfig, type SessionConfig, type TurnContext } from "@quorum/core";
import { MockAdapter, type AdapterRegistry } from "@quorum/adapters";
import { QuorumHttpServer } from "./http-server.js";

let root: string;
let server: QuorumHttpServer;
let base: string;
let token: string;

const CONFIG: SessionConfig = parseSessionConfig({
  seats: { proposer: { chain: ["pm"] }, critic: { chain: ["cm"] }, arbiter: { chain: ["am"] } },
  budgets: { max_turns_per_stage: 20 },
});

/** Registry of converging mock seats — distinct model per seat. */
function convergingRegistry(): { registry: AdapterRegistry } {
  const proposer = new MockAdapter({
    id: "pm",
    script: Array.from({ length: 40 }, () => (ctx: TurnContext) =>
      ctx.turnInStage >= 4
        ? { status: "ok" as const, content: `final ${ctx.stage}\nmove: PROPOSE_CONVERGE` }
        : { status: "ok" as const, content: `idea @${ctx.turnInStage}` },
    ),
  });
  const approver = (id: string): MockAdapter =>
    new MockAdapter({
      id,
      script: Array.from({ length: 40 }, () => (ctx: TurnContext) =>
        ctx.turnInStage >= 3
          ? { status: "ok" as const, content: "ok\nmove: APPROVE" }
          : { status: "ok" as const, content: "considering" },
      ),
    });
  const map = new Map<string, MockAdapter>([
    ["pm", proposer],
    ["cm", approver("cm")],
    ["am", approver("am")],
  ]);
  return { registry: { get: (id) => map.get(id) } };
}

async function api(path: string, method = "GET", body?: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "quorum-daemon-"));
});
afterEach(async () => {
  await server?.close();
  await rm(root, { recursive: true, force: true });
});

describe("QuorumHttpServer", () => {
  it("rejects unauthenticated requests", async () => {
    server = new QuorumHttpServer({ projectRoot: root, registryFactory: convergingRegistry });
    const info = await server.listen();
    base = info.url;
    const res = await fetch(`${info.url}/sessions`);
    expect(res.status).toBe(401);
  });

  it("writes daemon.json with port + token", async () => {
    server = new QuorumHttpServer({ projectRoot: root, registryFactory: convergingRegistry });
    const info = await server.listen();
    const handshake = JSON.parse(await readFile(join(root, ".quorum", "daemon.json"), "utf8"));
    expect(handshake.port).toBe(info.port);
    expect(handshake.token).toBe(info.token);
  });

  it("creates a session that runs brainstorm→plan to convergence", async () => {
    server = new QuorumHttpServer({ projectRoot: root, registryFactory: convergingRegistry });
    const info = await server.listen();
    base = info.url;
    token = info.token;

    const created = await (await api("/sessions", "POST", { goal: "Plan a party", config: CONFIG })).json();
    const running = server.daemon.get(created.id)!;
    const result = await running.wait();

    expect(result?.converged).toBe(true);
    expect(result?.stagesCompleted).toEqual(["brainstorm", "plan"]);

    const status = await (await api(`/sessions/${created.id}`)).json();
    expect(status.state).toBe("done");
    expect(Object.keys(status.seats)).toEqual(["proposer", "critic", "arbiter"]);
  });

  it("streams events over SSE with replay", async () => {
    server = new QuorumHttpServer({ projectRoot: root, registryFactory: convergingRegistry });
    const info = await server.listen();
    base = info.url;
    token = info.token;
    const created = await (await api("/sessions", "POST", { goal: "stream me", config: CONFIG })).json();
    await server.daemon.get(created.id)!.wait();

    const res = await fetch(`${base}/sessions/${created.id}/events?token=${token}`);
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("data:");
    expect(text).toContain('"type":"turn"');
    await reader.cancel();
  });

  it("injects a human message that reaches the transcript", async () => {
    // slow-ish seats so we can inject mid-run: proposer never converges here
    const chatty: { registry: AdapterRegistry } = {
      registry: {
        get: (id) => (id === "m" ? new MockAdapter({ id, script: Array.from({ length: 40 }, () => ({ status: "ok" as const, content: "thinking" })) }) : undefined),
      },
    };
    server = new QuorumHttpServer({
      projectRoot: root,
      registryFactory: () => chatty,
      stages: ["brainstorm"],
    });
    const info = await server.listen();
    base = info.url;
    token = info.token;
    const cfg = parseSessionConfig({ seats: { proposer: { chain: ["m"] }, critic: { chain: ["m"] } }, budgets: { max_turns_per_stage: 50 } });
    const created = await (await api("/sessions", "POST", { goal: "injectable", config: cfg })).json();

    await api(`/sessions/${created.id}/inject`, "POST", { content: "pivot to plan B" });
    await api(`/sessions/${created.id}/stop`, "POST");

    const transcript = await readFile(join(root, ".quorum", "sessions", created.id, "transcript.jsonl"), "utf8");
    expect(transcript).toContain("pivot to plan B");
  });

  it("stop halts the run and reports stopped", async () => {
    const hanging: { registry: AdapterRegistry } = {
      registry: { get: (id) => (id === "m" ? new MockAdapter({ id, script: [{ kind: "hang" }, { kind: "hang" }, { kind: "hang" }] }) : undefined) },
    };
    server = new QuorumHttpServer({ projectRoot: root, registryFactory: () => hanging, stages: ["brainstorm"] });
    const info = await server.listen();
    base = info.url;
    token = info.token;
    const cfg = parseSessionConfig({ seats: { proposer: { chain: ["m"] }, critic: { chain: ["m"] } } });
    const created = await (await api("/sessions", "POST", { goal: "stoppable", config: cfg })).json();

    const stopped = await (await api(`/sessions/${created.id}/stop`, "POST")).json();
    expect(["stopped", "error"]).toContain(stopped.state);
  });
});

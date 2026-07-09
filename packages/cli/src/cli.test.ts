import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSessionConfig, type TurnContext } from "@quorum/core";
import { MockAdapter, type AdapterRegistry } from "@quorum/adapters";
import { QuorumHttpServer } from "@quorum/daemon";
import { readDaemonInfo, makeClient } from "./client.js";
import { control, inject, latestSessionId, statusOf, streamEvents } from "./commands.js";
import { formatEvent } from "./format.js";

let root: string;
let server: QuorumHttpServer;

const CONFIG = parseSessionConfig({
  seats: { proposer: { chain: ["pm"] }, critic: { chain: ["cm"] } },
  budgets: { max_turns_per_stage: 50 },
});

function chattyRegistry(): { registry: AdapterRegistry } {
  const make = (id: string): MockAdapter =>
    new MockAdapter({ id, script: Array.from({ length: 100 }, () => (_c: TurnContext) => ({ status: "ok" as const, content: "thinking…" })) });
  const map = new Map([["pm", make("pm")], ["cm", make("cm")]]);
  return { registry: { get: (id) => map.get(id) } };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "quorum-cli-"));
  server = new QuorumHttpServer({ projectRoot: root, registryFactory: chattyRegistry, stages: ["brainstorm"] });
  await server.listen();
  await server.daemon.createSession("test goal", CONFIG);
});
afterEach(async () => {
  await server.close();
  await rm(root, { recursive: true, force: true });
});

describe("CLI commands against a live daemon", () => {
  it("reads daemon.json and resolves the latest session", async () => {
    const info = await readDaemonInfo(root);
    expect(info?.token).toBeTruthy();
    const client = makeClient(info!);
    expect(await latestSessionId(client)).toBeTruthy();
  });

  it("status → inject → pause → resume → stop round-trips", async () => {
    const client = makeClient((await readDaemonInfo(root))!);
    const before = await statusOf(client);
    expect(before.state).toBe("running");

    await inject(client, "please consider cost");
    expect((await control(client, "pause")).state).toBe("paused");
    expect((await control(client, "resume")).state).toBe("running");
    expect((await control(client, "stop")).state).toBe("stopped");
  });

  it("attach streams events including the injected message", async () => {
    const client = makeClient((await readDaemonInfo(root))!);
    await inject(client, "STREAM-MARKER");
    const id = (await latestSessionId(client))!;

    const ctrl = new AbortController();
    const seen: string[] = [];
    const collect = (async () => {
      for await (const e of streamEvents(client, id, ctrl.signal)) {
        seen.push(e.type === "human" ? e.content : e.type);
        if (seen.includes("STREAM-MARKER")) ctrl.abort();
      }
    })().catch(() => {});
    await collect;
    expect(seen).toContain("STREAM-MARKER");
    await control(client, "stop");
  });

  it("formats events for the terminal without throwing", () => {
    expect(formatEvent({ ts: "2026-07-06T10:00:00.000Z", type: "turn", seat: "proposer", model: "m", content: "hi", move: "APPROVE" }, false)).toContain("proposer");
    expect(formatEvent({ ts: "2026-07-06T10:00:00.000Z", type: "human", content: "x" }, false)).toContain("you");
  });
});

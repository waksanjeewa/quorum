import { describe, expect, it } from "vitest";
import { parseSessionConfig, type SessionConfig } from "@quorum/core";
import { makeTestContext } from "./contract/adapter-contract.js";
import { MockAdapter } from "./mock/mock-adapter.js";
import { SeatManager, type AdapterRegistry } from "./seat-manager.js";

function registryOf(...adapters: MockAdapter[]): AdapterRegistry {
  const map = new Map(adapters.map((a) => [a.id, a]));
  return { get: (id) => map.get(id) };
}

const CONFIG: SessionConfig = parseSessionConfig({
  seats: {
    proposer: { chain: ["a1", "a2", "a3"] },
    critic: { chain: ["b1", "b2"] },
  },
});

const sig = () => new AbortController().signal;

describe("SeatManager", () => {
  it("seats the first available model per chain", () => {
    const sm = new SeatManager(CONFIG, registryOf(new MockAdapter({ id: "a1" }), new MockAdapter({ id: "b1" })));
    const seats = sm.seats();
    expect(seats.proposer?.id).toBe("a1");
    expect(seats.critic?.id).toBe("b1");
  });

  it("skips a missing model to the next in the chain", () => {
    // a1 not in registry → proposer resolves to a2
    const sm = new SeatManager(CONFIG, registryOf(new MockAdapter({ id: "a2" }), new MockAdapter({ id: "b1" })));
    expect(sm.seats().proposer?.id).toBe("a2");
  });

  it("failover walks the chain and returns null when exhausted", async () => {
    const sm = new SeatManager(CONFIG, registryOf(new MockAdapter({ id: "a1" }), new MockAdapter({ id: "a2" }), new MockAdapter({ id: "a3" })));
    sm.seats(); // cursor at a1
    const r1 = await sm.failover("proposer", { status: "usage_limit", detail: "x" });
    expect(r1?.id).toBe("a2");
    const r2 = await sm.failover("proposer", { status: "error", detail: "y", retryable: false });
    expect(r2?.id).toBe("a3");
    const r3 = await sm.failover("proposer", { status: "usage_limit", detail: "z" });
    expect(r3).toBeNull(); // chain exhausted
  });

  it("proactively hands off when probed quota is below threshold", async () => {
    const lowQuota = new MockAdapter({ id: "a1", quota: { remainingPct: 5, resetsAt: "2026-07-06T15:00:00.000Z" } });
    const sm = new SeatManager(CONFIG, registryOf(lowQuota, new MockAdapter({ id: "a2" })), { proactiveThresholdPct: 10 });
    const runner = sm.seats().proposer!;
    const res = await runner.takeTurn(makeTestContext(), sig());
    expect(res.status).toBe("usage_limit");
    expect(res.status === "usage_limit" && res.detail).toContain("proactive");
  });

  it("does not hand off when quota is healthy", async () => {
    const ok = new MockAdapter({ id: "a1", quota: { remainingPct: 80 } });
    const sm = new SeatManager(CONFIG, registryOf(ok), { proactiveThresholdPct: 10 });
    const res = await sm.seats().proposer!.takeTurn(makeTestContext(), sig());
    expect(res.status).toBe("ok");
  });

  it("respects cooldown, then re-includes a model once its reset time passes", async () => {
    let t = Date.parse("2026-07-06T10:00:00.000Z");
    const now = () => new Date(t);
    const sm = new SeatManager(CONFIG, registryOf(new MockAdapter({ id: "a1" }), new MockAdapter({ id: "a2" })), { now });
    sm.seats();
    // a1 hits a limit that resets at 11:00 → cools down, failover to a2
    const r = await sm.failover("proposer", { status: "usage_limit", detail: "limit", resetsAt: "2026-07-06T11:00:00.000Z" });
    expect(r?.id).toBe("a2");
    // before reset: resetSeat skips a1 (cooling) → a2
    expect(sm.resetSeat("proposer")?.id).toBe("a2");
    // after reset time: a1 usable again
    t = Date.parse("2026-07-06T11:30:00.000Z");
    expect(sm.resetSeat("proposer")?.id).toBe("a1");
  });
});

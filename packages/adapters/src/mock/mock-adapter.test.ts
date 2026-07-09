import { describe, expect, it } from "vitest";
import {
  describeAdapterContract,
  makeTestContext,
  type ContractHarness,
} from "../contract/adapter-contract.js";
import { MockAdapter } from "./mock-adapter.js";

const harness: ContractHarness = {
  makeHealthy: () => new MockAdapter(),
  makeAuthFailure: () => new MockAdapter({ auth: { ok: false, detail: "no key" } }),
  makeUsageLimited: () =>
    new MockAdapter({ script: [{ status: "usage_limit", detail: "5-hour limit reached" }] }),
  makeHanging: () => new MockAdapter({ script: [{ kind: "hang" }] }),
  makeMalformed: () => new MockAdapter({ script: [{ kind: "throw", message: "bad JSON" }] }),
};

describeAdapterContract("mock", harness);

describe("MockAdapter specifics", () => {
  it("consumes its script in order, then falls back to an echo", async () => {
    const a = new MockAdapter({
      script: [
        { status: "ok", content: "first", move: "PROPOSE_CONVERGE" },
        { status: "error", detail: "boom", retryable: true },
      ],
    });
    const sig = new AbortController().signal;
    expect(await a.takeTurn(makeTestContext(), sig)).toMatchObject({ content: "first", move: "PROPOSE_CONVERGE" });
    expect(await a.takeTurn(makeTestContext(), sig)).toMatchObject({ status: "error" });
    const echo = await a.takeTurn(makeTestContext({ goal: "ship it" }), sig);
    expect(echo).toMatchObject({ status: "ok" });
    expect(echo.status === "ok" && echo.content).toContain("ship it");
    expect(a.calls).toBe(3);
  });

  it("supports dynamic responses based on context", async () => {
    const a = new MockAdapter({
      script: [(ctx) => ({ status: "ok", content: `role=${ctx.role} turn=${ctx.turnInStage}` })],
    });
    const res = await a.takeTurn(makeTestContext({ role: "critic", turnInStage: 4 }), new AbortController().signal);
    expect(res.status === "ok" && res.content).toBe("role=critic turn=4");
  });

  it("defines probeQuota only when configured", async () => {
    expect(new MockAdapter().probeQuota).toBeUndefined();
    const a = new MockAdapter({ quota: { remainingPct: 8, resetsAt: "2026-07-06T15:00:00.000Z" } });
    expect(await a.probeQuota?.()).toEqual({ remainingPct: 8, resetsAt: "2026-07-06T15:00:00.000Z" });
  });

  it("simulates a slow turn that is cancelable mid-flight", async () => {
    const a = new MockAdapter({ script: [{ kind: "delay", ms: 5000, result: { status: "ok", content: "late" } }] });
    const ctrl = new AbortController();
    const p = a.takeTurn(makeTestContext(), ctrl.signal);
    setTimeout(() => ctrl.abort(), 10);
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});

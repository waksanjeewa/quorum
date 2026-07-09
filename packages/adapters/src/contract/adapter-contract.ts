import { describe, expect, it } from "vitest";
import type { TurnContext } from "@quorum/core";
import { isAbortError, type ModelAdapter } from "../types.js";

/**
 * A harness produces adapters in specific states so the shared contract can exercise each one.
 * Real adapters (ollama, claude, codex, http) implement this against stubbed transports.
 */
export interface ContractHarness {
  /** Auth ok, a normal "ok" turn. */
  makeHealthy(): ModelAdapter;
  /** auth() resolves { ok:false } — must NOT throw. */
  makeAuthFailure(): ModelAdapter;
  /** takeTurn resolves { status:"usage_limit" }. */
  makeUsageLimited(): ModelAdapter;
  /** takeTurn blocks until the AbortSignal fires. */
  makeHanging(): ModelAdapter;
  /** Upstream returns garbage; takeTurn must resolve { status:"error" }, never throw. */
  makeMalformed(): ModelAdapter;
}

export function makeTestContext(overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    seat: "proposer",
    role: "proposer",
    stage: "brainstorm",
    turnInStage: 1,
    goal: "test goal",
    summary: "",
    recentTurns: [],
    pendingInjections: [],
    roleInstructions: "You are the proposer.",
    ...overrides,
  };
}

/** Reject if `p` does not settle within `ms`. Used to bound the abort-latency assertion. */
function within<T>(ms: number, p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)),
  ]);
}

/**
 * The contract every ModelAdapter must satisfy (SPEC §5, task 030 acceptance).
 * Call from an adapter's test file: `describeAdapterContract("ollama", ollamaHarness)`.
 */
export function describeAdapterContract(name: string, harness: ContractHarness): void {
  describe(`ModelAdapter contract: ${name}`, () => {
    it("exposes an id and capabilities", () => {
      const a = harness.makeHealthy();
      expect(a.id.length).toBeGreaterThan(0);
      const caps = a.capabilities();
      expect(typeof caps.passThroughCommands).toBe("boolean");
      expect(["subscription", "api", "free"]).toContain(caps.costTier);
    });

    it("a healthy adapter returns an ok turn", async () => {
      const a = harness.makeHealthy();
      const res = await a.takeTurn(makeTestContext(), new AbortController().signal);
      expect(res.status).toBe("ok");
    });

    it("reports auth failure without throwing", async () => {
      const a = harness.makeAuthFailure();
      const auth = await a.auth(); // must resolve, not reject
      expect(auth.ok).toBe(false);
      expect(auth.detail.length).toBeGreaterThan(0);
    });

    it("detects usage limits", async () => {
      const a = harness.makeUsageLimited();
      const res = await a.takeTurn(makeTestContext(), new AbortController().signal);
      expect(res.status).toBe("usage_limit");
    });

    it("honors AbortSignal within 2s", async () => {
      const a = harness.makeHanging();
      const ctrl = new AbortController();
      const p = a.takeTurn(makeTestContext(), ctrl.signal);
      setTimeout(() => ctrl.abort(), 10);
      await expect(within(2000, p)).rejects.toSatisfy(isAbortError);
    });

    it("maps malformed upstream output to error, never throws", async () => {
      const a = harness.makeMalformed();
      const res = await a.takeTurn(makeTestContext(), new AbortController().signal);
      expect(res.status).toBe("error");
    });
  });
}

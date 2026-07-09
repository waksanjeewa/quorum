import { describe, expect, it } from "vitest";
import { describeAdapterContract, makeTestContext, type ContractHarness } from "../contract/adapter-contract.js";
import type { ChatClient, SdkAdapter } from "./chat-client.js";
import { createClaudeAdapter } from "../claude/claude-adapter.js";
import { createCodexAdapter } from "../codex/codex-adapter.js";

/** Stub ChatClient factories for each contract state. */
const okClient = (text: string): ChatClient => ({ async run() { return { text, sessionId: "s1" }; } });
const throwingClient = (message: string): ChatClient => ({
  async run() {
    throw new Error(message);
  },
});
const hangingClient = (): ChatClient => ({
  run: ({ signal }) =>
    new Promise((_, reject) => {
      if (signal.aborted) return reject(new DOMException("aborted", "AbortError"));
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }),
});

function harnessFor(make: (client: ChatClient, authOk: boolean) => SdkAdapter): ContractHarness {
  return {
    makeHealthy: () => make(okClient("an idea\nmove: APPROVE"), true),
    makeAuthFailure: () => make(okClient("x"), false),
    makeUsageLimited: () => make(throwingClient("You've hit your usage limit; resets soon"), true),
    makeHanging: () => make(hangingClient(), true),
    makeMalformed: () => make(throwingClient("some transport blew up"), true),
  };
}

const claudeMake = (client: ChatClient, authOk: boolean) =>
  createClaudeAdapter({ client, authCheck: async () => ({ ok: authOk, detail: authOk ? "ok" : "no login" }) });
const codexMake = (client: ChatClient, authOk: boolean) =>
  createCodexAdapter({ client, authCheck: async () => ({ ok: authOk, detail: authOk ? "ok" : "no login" }), probeQuota: async () => ({ remainingPct: 90 }) });

describeAdapterContract("claude (sdk stub)", harnessFor(claudeMake));
describeAdapterContract("codex (sdk stub)", harnessFor(codexMake));

describe("SDK adapter specifics", () => {
  const sig = () => new AbortController().signal;

  it("claude advertises pass-through + subscription tier", () => {
    const caps = createClaudeAdapter({ client: okClient("x"), authCheck: async () => ({ ok: true, detail: "" }) }).capabilities();
    expect(caps.passThroughCommands).toBe(true);
    expect(caps.costTier).toBe("subscription");
  });

  it("codex has a probeQuota; claude does not", () => {
    const codex = createCodexAdapter({ client: okClient("x"), probeQuota: async () => ({ remainingPct: 42 }) });
    const claude = createClaudeAdapter({ client: okClient("x") });
    expect(typeof codex.probeQuota).toBe("function");
    expect(claude.probeQuota).toBeUndefined();
  });

  it("maps a usage-limit message to usage_limit with resetsAt when an ISO time is present", async () => {
    const a = createClaudeAdapter({
      client: throwingClient("5-hour limit reached, resets 2026-07-06T15:00:00.000Z"),
      authCheck: async () => ({ ok: true, detail: "" }),
    });
    const res = await a.takeTurn(makeTestContext(), sig());
    expect(res.status).toBe("usage_limit");
    expect(res.status === "usage_limit" && res.resetsAt).toBe("2026-07-06T15:00:00.000Z");
  });

  it("resumes a session id across turns", async () => {
    const seen: Array<string | undefined> = [];
    const client: ChatClient = {
      async run({ sessionId }) {
        seen.push(sessionId);
        return { text: "ok", sessionId: "thread-123" };
      },
    };
    const a = createCodexAdapter({ client, probeQuota: async () => ({}) });
    await a.takeTurn(makeTestContext(), sig());
    await a.takeTurn(makeTestContext(), sig());
    expect(seen).toEqual([undefined, "thread-123"]); // second turn resumes
  });
});

import { describe, expect, it } from "vitest";
import { describeAdapterContract, makeTestContext, type ContractHarness } from "../contract/adapter-contract.js";
import { hangingFetch, jsonResponse, stubFetch } from "../contract/stub-fetch.js";
import { OllamaAdapter } from "./ollama-adapter.js";

const chatOk = stubFetch((url) =>
  url.endsWith("/api/tags")
    ? jsonResponse({ models: [] })
    : jsonResponse({ message: { content: "an idea\nmove: PROPOSE_CONVERGE" } }),
);

const harness: ContractHarness = {
  makeHealthy: () => new OllamaAdapter({ model: "llama3", fetchImpl: chatOk }),
  makeAuthFailure: () =>
    new OllamaAdapter({
      model: "llama3",
      fetchImpl: stubFetch(() => {
        throw new Error("ECONNREFUSED");
      }),
    }),
  makeUsageLimited: () =>
    new OllamaAdapter({ model: "llama3", fetchImpl: stubFetch(() => jsonResponse({}, 429)) }),
  makeHanging: () => new OllamaAdapter({ model: "llama3", fetchImpl: hangingFetch() }),
  makeMalformed: () =>
    new OllamaAdapter({ model: "llama3", fetchImpl: stubFetch(() => jsonResponse({ nope: true })) }),
};

describeAdapterContract("ollama", harness);

describe("OllamaAdapter specifics", () => {
  it("derives id from the model and reads message.content", async () => {
    const a = new OllamaAdapter({ model: "llama3", fetchImpl: chatOk });
    expect(a.id).toBe("ollama/llama3");
    const res = await a.takeTurn(makeTestContext(), new AbortController().signal);
    expect(res.status === "ok" && res.content).toContain("an idea");
    expect(a.capabilities().costTier).toBe("free");
  });

  it("auth() reports reachability", async () => {
    const up = await new OllamaAdapter({ model: "llama3", fetchImpl: chatOk }).auth();
    expect(up.ok).toBe(true);
  });

  it("5xx is a retryable error", async () => {
    const a = new OllamaAdapter({ model: "llama3", fetchImpl: stubFetch(() => jsonResponse({}, 503)) });
    const res = await a.takeTurn(makeTestContext(), new AbortController().signal);
    expect(res).toMatchObject({ status: "error", retryable: true });
  });
});

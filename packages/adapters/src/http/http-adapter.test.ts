import { describe, expect, it } from "vitest";
import { describeAdapterContract, makeTestContext, type ContractHarness } from "../contract/adapter-contract.js";
import { hangingFetch, jsonResponse, stubFetch } from "../contract/stub-fetch.js";
import { HttpAdapter } from "./http-adapter.js";
import { resolveHttpAdapter } from "./presets.js";
import { estimateCostUsd } from "./prices.js";

const completion = (content: string) =>
  jsonResponse({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 50 } });

const base = { id: "openrouter/x", baseUrl: "https://openrouter.ai/api/v1", model: "x", apiKey: "sk-test" };

const harness: ContractHarness = {
  makeHealthy: () => new HttpAdapter({ ...base, fetchImpl: stubFetch(() => completion("hi\nmove: APPROVE")) }),
  makeAuthFailure: () => new HttpAdapter({ ...base, apiKey: undefined, keyEnvName: "OPENROUTER_API_KEY" }),
  makeUsageLimited: () => new HttpAdapter({ ...base, fetchImpl: stubFetch(() => jsonResponse({}, 429)) }),
  makeHanging: () => new HttpAdapter({ ...base, fetchImpl: hangingFetch() }),
  makeMalformed: () => new HttpAdapter({ ...base, fetchImpl: stubFetch(() => jsonResponse({ choices: [] })) }),
};

describeAdapterContract("http (openai-compatible)", harness);

describe("HttpAdapter specifics", () => {
  const sig = () => new AbortController().signal;

  it("parses content + estimates usage cost", async () => {
    const a = new HttpAdapter({ ...base, model: "deepseek/deepseek-chat", fetchImpl: stubFetch(() => completion("idea")) });
    const res = await a.takeTurn(makeTestContext(), sig());
    expect(res.status === "ok" && res.content).toBe("idea");
    expect(res.status === "ok" && res.usage?.costUsd).toBeGreaterThan(0);
  });

  it("a :free model costs 0", () => {
    expect(estimateCostUsd("deepseek/deepseek-chat:free", 1000, 1000)).toBe(0);
  });

  it("missing key → auth fails naming the env var, and a turn errors non-retryably (no crash)", async () => {
    const a = new HttpAdapter({ ...base, apiKey: undefined, keyEnvName: "OPENROUTER_API_KEY" });
    const auth = await a.auth();
    expect(auth.ok).toBe(false);
    expect(auth.detail).toContain("OPENROUTER_API_KEY");
    const res = await a.takeTurn(makeTestContext(), sig());
    expect(res).toMatchObject({ status: "error", retryable: false });
  });

  it("429 with Retry-After yields usage_limit + resetsAt", async () => {
    const a = new HttpAdapter({
      ...base,
      fetchImpl: stubFetch(() => new Response("{}", { status: 429, headers: { "retry-after": "60" } })),
    });
    const res = await a.takeTurn(makeTestContext(), sig());
    expect(res.status).toBe("usage_limit");
    expect(res.status === "usage_limit" && res.resetsAt).toBeTruthy();
  });

  it("401 is a non-retryable auth error", async () => {
    const a = new HttpAdapter({ ...base, fetchImpl: stubFetch(() => jsonResponse({}, 401)) });
    expect(await a.takeTurn(makeTestContext(), sig())).toMatchObject({ status: "error", retryable: false });
  });
});

describe("resolveHttpAdapter", () => {
  const providers = { openrouter: { baseUrl: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY" } };

  it("resolves a gateway id with a nested model name", () => {
    const a = resolveHttpAdapter("openrouter/deepseek/deepseek-chat:free", {
      providers,
      env: { OPENROUTER_API_KEY: "sk" },
    });
    expect(a?.id).toBe("openrouter/deepseek/deepseek-chat:free");
    expect(a?.capabilities().costTier).toBe("free");
  });

  it("resolves a built-in direct provider", () => {
    const a = resolveHttpAdapter("anthropic-api/claude-opus", { env: { ANTHROPIC_API_KEY: "sk" } });
    expect(a?.capabilities().costTier).toBe("api");
  });

  it("returns undefined for non-http ids (ollama, bare names)", () => {
    expect(resolveHttpAdapter("ollama/llama3")).toBeUndefined();
    expect(resolveHttpAdapter("claude")).toBeUndefined();
    expect(resolveHttpAdapter("unknownprovider/model")).toBeUndefined();
  });
});

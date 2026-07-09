import { describe, expect, it } from "vitest";
import { parseSessionConfig } from "@quorum/core";
import { doctorReport } from "./doctor.js";

/** A fetch that makes Ollama's /api/tags reachable. */
const okFetch = ((async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.endsWith("/api/tags")) return new Response(JSON.stringify({ models: [] }), { status: 200 });
  return new Response("{}", { status: 200 });
}) as unknown) as typeof fetch;

describe("doctorReport", () => {
  it("reports ok for a reachable ollama seat and not-ok for a keyless HTTP seat", async () => {
    const config = parseSessionConfig({
      seats: {
        proposer: { chain: ["ollama/llama3"] },
        critic: { chain: ["openrouter/deepseek/deepseek-chat:free"] },
      },
      providers: { openrouter: { base_url: "https://openrouter.ai/api/v1", key_env: "MISSING_KEY_ENV" } },
    });

    const report = await doctorReport(config, { fetchImpl: okFetch, env: {} });
    const ollama = report.find((r) => r.id === "ollama/llama3");
    const or = report.find((r) => r.id.startsWith("openrouter/"));
    expect(ollama?.ok).toBe(true);
    expect(or?.ok).toBe(false);
    expect(or?.detail).toContain("MISSING_KEY_ENV"); // actionable hint
    expect(ollama?.canExecute).toBe(false);
  });
});
